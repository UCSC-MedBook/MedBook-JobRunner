function UpDownGenes (job_id) {
  Job.call(this, job_id);
}
UpDownGenes.prototype = Object.create(Job.prototype);
UpDownGenes.prototype.constructor = UpDownGenes;

UpDownGenes.prototype.run = function () {
  // create paths for files on the disk
  var workDir = ntemp.mkdirSync("UpDownGenes");
  console.log("workDir: ", workDir);

  var deferred = Q.defer();
  var self = this;

  // if the first parts of this command have already been run,
  // grab the paths for those output files
  var sample_group_id = self.job.args.sample_group_id;
  var iqr_multiplier = self.job.args.iqr_multiplier;
  var associated_object = {
    collection_name: "SampleGroups",
    mongo_id: sample_group_id,
  };

  function getStoragePath(file_name) {
    var blob = Blobs2.findOne({
      file_name: file_name,
      associated_object: associated_object,
      "metadata.iqr_multiplier": iqr_multiplier,
    });

    if (blob) {
      return blob.getFilePath();
    }
  }
  var medianPath = getStoragePath("median.tsv");
  var highThresholdPath = getStoragePath("highthreshold.tsv");
  var lowThresholdPath = getStoragePath("lowthreshold.tsv");
  var regenerateFiles = false;

  // medianPath is the one to check if they exist or not so make sure
  // it's null if any of them don't exist
  if (!medianPath || !highThresholdPath || !lowThresholdPath) {
    regenerateFiles = true;
  }

  var exportScript = getSetting("genomic_expression_export");
  var exportCommands = [
    // single sample data
    spawnCommand(exportScript, [
      "--data_set_id", self.job.args.data_set_id,
      "--sample_label", self.job.args.sample_label,
    ], workDir),
  ];

  // also write out sample group data if necessary
  if (regenerateFiles) {
    exportCommands.push(spawnCommand(exportScript, [
      "--sample_group_id", sample_group_id,
    ], workDir));
  }

  Q.all(exportCommands)
    .then(function (spawnResults) {
      // check if there was a problem exporting the data
      var uniqueExitCodes = _.uniq(_.pluck(spawnResults, "exitCode"));
      if (uniqueExitCodes.length !== 1 || uniqueExitCodes[0] !== 0) {
        throw new Error("Writing files failed (exit code not 0)");
      }

      // save this result for use in a future chained promise
      self.testSamplePath = spawnResults[0].stdoutPath;

      if (regenerateFiles) {
        // // pulled from upDownGenes.sh
        // # arg 1: matrix file
        // # arg 2: default 1.5
        // /usr/bin/Rscript outlier.R mRNA.NBL.POG.pancan.combat.5.tab 2

        return spawnCommand("Rscript", [
          getSetting("calculate_outlier_genes"),
          spawnResults[1].stdoutPath,
          iqr_multiplier,
        ], workDir);
      }
    })
    .then(function (commandResult) {
      // if we just regenerated the files, use them
      if (regenerateFiles) {
        if (commandResult.exitCode !== 0) {
          throw new Error("Error code running up/down genes Rscript");
        }

        medianPath = path.join(workDir, "median.tsv");
        highThresholdPath = path.join(workDir, "highthreshold.tsv");
        lowThresholdPath = path.join(workDir, "lowthreshold.tsv");
      }

      return spawnCommand("/bin/sh", [
        getSetting("outlier_analysis"),
        self.testSamplePath,
        medianPath,
        highThresholdPath,
        lowThresholdPath
      ], workDir);
    })
    .then(Meteor.bindEnvironment(function (commandResult) {
      if (commandResult.exitCode !== 0) {
        throw new Error("Error code running outlier analysis script");
      }
      console.log("done with single sample analysis");

      // save the intermediary files if necessary
      if (regenerateFiles) {
        // NOTE: We don't technically need to wait until these are saved
        // until the job is done.
        // (This is an assumption that might not be true)

        function printError (err) {
          if (err) {
            console.log("error creating blob:", err);
          }
        }
        var meta = { iqr_multiplier: iqr_multiplier };
        Blobs2.create(medianPath, associated_object, meta, printError);
        Blobs2.create(highThresholdPath, associated_object, meta, printError);
        Blobs2.create(lowThresholdPath, associated_object, meta, printError);
      }

      // calculate the paths for the output files
      upPath = path.join(workDir, "up_outlier_genes")
      downPath = path.join(workDir, "down_outlier_genes")

      // insert blobs into mongo
      var output = {
        up_blob_id: Blobs.insert(upPath)._id,
        down_blob_id: Blobs.insert(downPath)._id,
      };

      // parse strings
      _.each([
        { name: "up_genes", fileString: fs.readFileSync(upPath, "utf8") },
        { name: "down_genes", fileString: fs.readFileSync(downPath, "utf8") },
      ], function (outlier) {
        var lineArray = outlier.fileString.split("\n");
        var filteredLines = _.filter(lineArray, function (line) {
          return line !== "";
        });

        // loop for each line
        output[outlier.name] = _.map(filteredLines, function (line) {
          var tabSplit = line.split(" ");
          return {
            gene_label: tabSplit[0],
            background_median: parseFloat(tabSplit[1]),
            sample_value: parseFloat(tabSplit[2]),
          };
        });
      });

      deferred.resolve(output);
    }, deferred.reject))
    // NOTE: Meteor.bindEnvironment returns immidiately, meaning we can't
    // quite use the nice promise syntax of chainging .thens
    .catch(deferred.reject);
  return deferred.promise;
};

// Called when this job successfully completes.
// Emails the creator with an alert & link to results page
UpDownGenes.prototype.onSuccess = function (result) {
  console.log("UpDownGenes -- Success -- sending notification email.");

  var user = Meteor.users.findOne({ _id: this.job.user_id });
  var resultsURL = "https://medbook.io/tools/outlier-analysis/" + this.job._id;

  try {
    Email.send({
      to: user.collaborations.email_address,
      from: "ucscmedbook@gmail.com",
      subject: "Outlier analysis for " + this.job.args["sample_label"] +
          " complete.",
      html: "Your outlier analysis job has completed. Results:\n<a href='" +
          resultsURL + "'>" + resultsURL + "</a>" ,
    });

    console.log("Notification email sent for job ",  this.job._id);
  } catch (e) {
    console.log("Error: Notification email failed for job ",  this.job._id);
  }
};


JobClasses.UpDownGenes = UpDownGenes;
