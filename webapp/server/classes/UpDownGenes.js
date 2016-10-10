function UpDownGenes (job_id) {
  Job.call(this, job_id);
}
UpDownGenes.prototype = Object.create(Job.prototype);
UpDownGenes.prototype.constructor = UpDownGenes;

UpDownGenes.prototype.run = function () {
  // create paths for files on the disk
  var workDir = ntemp.mkdirSync("UpDownGenes");
  console.log("workDir: ", workDir);

  // define some variables to use down below
  var outlierFields = [
    { name: "Genes", value_type: "String" },
    { name: "Background median", value_type: "Number" },
    { name: "Sample value", value_type: "Number" },
  ];

  var topFivePercentFields = [
    { name: "Genes", value_type: "String" },
    { name: "Sample value", value_type: "Number" },
  ];

  // prepare for the promise chain
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

  // Find a potential blob associated with the object above.
  // only for median/highthreshold/lowthreshold.tsv blobs which have
  // the from_filtered_sample_group field
  // is_filtered: true if it's using the filtered version of a
  // sample group; null otherwise (NOT false!)
  function getStoragePath(file_name, is_filtered) {
    var blob = Blobs2.findOne({
      file_name: file_name,
      associated_object: associated_object,
      "metadata.iqr_multiplier": iqr_multiplier,
      "metadata.from_filtered_sample_group": is_filtered
    });

    if (blob) {
      return blob.getFilePath();
    }
  }

  // Set up to work with getStoragePath; either true or null
  var usingFilter = self.job.args.use_filtered_sample_group
  if(! usingFilter){usingFilter = null;}

  var medianPath = getStoragePath("median.tsv", usingFilter);
  var highThresholdPath = getStoragePath("highthreshold.tsv", usingFilter);
  var lowThresholdPath = getStoragePath("lowthreshold.tsv", usingFilter);
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
    // If we're using the filtered sample group,
    // get the blob with filtered data; otherwise, export it from scratch.
    if(usingFilter){
      var filteredBlob = Blobs2.findOne({
        associated_object:associated_object,
        "metadata.type":"ExprAndVarFilteredSampleGroupData",
      });
      // If we can't find one, just give up instead of generating it here;
      // We don't want to get into calling a job from another job
      if(!filteredBlob){
        throw new Error("Couldn't find the filtered sample group data that was promised.");
      }
      var filteredBlobPath = filteredBlob.getFilePath() ;
    }else{
      exportCommands.push(spawnCommand(exportScript, [
        "--sample_group_id", sample_group_id,
      ], workDir));
    }
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

        // Get the path for the sample group data
        // depends on whether we just exported it or are using a filtered blob
        var sampleGroupPath=(usingFilter)? filteredBlobPath : spawnResults[1].stdoutPath;

        // Calculate the median, high, and low thresholds for the genes
        return spawnCommand("Rscript", [
          getSetting("calculate_outlier_genes"),
          sampleGroupPath,
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
        // Metadata for median & up downblobs; note if filtered.
        var meta = { iqr_multiplier: iqr_multiplier};
        if(usingFilter){ meta.from_filtered_sample_group = true; }

        Blobs2.create(medianPath, associated_object, meta, printError);
        Blobs2.create(highThresholdPath, associated_object, meta, printError);
        Blobs2.create(lowThresholdPath, associated_object, meta, printError);
      }

      // calculate the paths for the output files
      upPath = path.join(workDir, "up_outlier_genes")
      downPath = path.join(workDir, "down_outlier_genes")
      top5Path = path.join(workDir, "top_5_percent_most_highly_expressed_genes.tsv")


      // Save output files as Blobs2 "synchronously" with wrapAsync

      var output = {};
      var associated_job_object = {
        collection_name: "Jobs",
        mongo_id: self.job._id,
      };
      var createBlob2Sync = Meteor.wrapAsync(Blobs2.create);

      // Output files are associated with a job, not the sample group,
      // so they don't need to be tagged with usingFilter.
      try{
        var upGenesBlob = createBlob2Sync(upPath, associated_job_object, {});
        var downGenesBlob = createBlob2Sync(downPath, associated_job_object, {});
        var top5blob = createBlob2Sync(top5Path, associated_job_object, {});
        output["up_blob_id"] = upGenesBlob._id;
        output["down_blob_id"] = downGenesBlob._id;
        output["top5percent_blob_id"] = top5blob._id;
      }catch(error){
        // Log the error and throw it again to properly fail the outlier analysis job
        console.log("Error storing output files for Outlier Analysis:", error);
        throw(error);
      }


      // parse the output into the output object and gene sets
      var geneSetInsertPromises = [];

      _.each([
        {
          outlier_type: "up",
          fileString: fs.readFileSync(upGenesBlob.getFilePath(), "utf8"),
          fields: outlierFields,
          prependToName: "Up outliers ",
        },
        {
          outlier_type: "down",
          fileString: fs.readFileSync(downGenesBlob.getFilePath(), "utf8"),
          fields: outlierFields,
          prependToName: "Down outliers ",
        },
        {
          outlier_type: "top5percent",
          fileString: fs.readFileSync(top5blob.getFilePath(), "utf8"),
          fields: topFivePercentFields,
          prependToName: "Top 5 percent ",
        },
      ], function (outlier) {
        var lineArray = outlier.fileString.split("\n");
        var filteredLines = _.filter(lineArray, function (line) {
          return line !== "";
        });

        var records = [];
        var outlierOutput = [];

        // calculate the list of records as well as the outlier output
        // to put in the job's output object
        _.each(filteredLines, function (line) {
          // Populate the found genes.
          // The top5percent overexpressed file has a different format from the
          // other files so split its columns separately.
          if(outlier.outlier_type == "top5percent"){
            var tabSplit = line.split("\t");

            var gene_label = tabSplit[0];
            var sample_value = parseFloat(tabSplit[1]);

            outlierOutput.push({
              gene_label: gene_label,
              sample_value: sample_value,
              // no background_median
            });

            records.push({
              "Genes": gene_label,
              "Sample value": sample_value,
            });
          }else{
            var tabSplit = line.split(" ");

            var gene_label = tabSplit[0];
            var background_median = parseFloat(tabSplit[1]);
            var sample_value = parseFloat(tabSplit[2]);

            outlierOutput.push({
              gene_label: tabSplit[0],
              background_median: background_median,
              sample_value: sample_value,
            });

            records.push({
              "Genes": gene_label,
              "Sample value": sample_value,
              "Background median": background_median
            });
          }

          if (isNaN(sample_value)) {
            console.log("outlier.outlier_type:", outlier.outlier_type);
            console.log("tabSplit:", tabSplit);
            console.log("line:", line);
          }
        });

        output[outlier.outlier_type + "_genes"] = outlierOutput;
        output[outlier.outlier_type + "_genes_count"] = filteredLines.length;

        // add a gene set associated with this job (but only if there is
        // at least one outlier)
        if (records.length) {
          // figure out the name
          var name = outlier.prependToName + ": " + self.job.args.sample_label;
          if (outlier.outlier_type !== "top5percent") {
            name += " vs. " + self.job.args.sample_group_name;
          }

          // figure out the description
          var description;
          if (outlier.outlier_type === "top5percent") {
            description = "Top 5% of genes in " + self.job.args.sample_label;
          } else {
            var filteredGenesParens = "";
            if (self.job.args.use_filtered_sample_group) {
              filteredGenesParens = " (with gene filters applied)";
            }

            description = "genes in " + self.job.args.sample_label +
                " compared to " + self.job.args.sample_group_name +
                filteredGenesParens + " with an IQR of " +
                self.job.args.iqr_multiplier;
          }

          var geneSetId = GeneSets.insert({
            name: name,
            description: description,

            associated_object: {
              collection_name: "Jobs",
              mongo_id: self.job._id
            },
            metadata: {
              outlier_type: outlier.outlier_type
            },

            fields: outlier.fields,

            gene_labels: _.pluck(records, "Genes"),
            gene_label_field: "Genes",
          });

          // insert the records associated with the gene set
          var bulk = Records.rawCollection().initializeUnorderedBulkOp();
          _.each(records, function (record) {
            record.associated_object = {
              collection_name: "GeneSets",
              mongo_id: geneSetId,
            };

            MedBook.validateRecord(record, outlier.fields);

            bulk.insert(record);
          });

          var geneSetDeferred = Q.defer();
          geneSetInsertPromises.push(geneSetDeferred.promise);
          bulk.execute(errorResultResolver(geneSetDeferred));
        }
      });

      // wait for all of the bulk inserts to be done and then resolve the job
      // with the output we built up previously
      Q.all(geneSetInsertPromises)
        .then(function () {
          deferred.resolve(output);
        })
        .catch(deferred.reject);
    }, deferred.reject))
    // NOTE: Meteor.bindEnvironment returns immediately, meaning we can't
    // quite use the nice promise syntax of chaining .thens
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
