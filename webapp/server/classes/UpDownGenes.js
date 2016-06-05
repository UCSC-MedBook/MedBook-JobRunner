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

  var exportScript = getSetting("gene_expression_export");
  Q.all([
      // single sample data
      spawnCommand(exportScript, [
        "--data_set_id", self.job.args.data_set_id,
        "--sample_label", self.job.args.sample_label,
      ], workDir),
      // sample group data
      spawnCommand(exportScript, [
        "--sample_group_id", self.job.args.sample_group_id,
      ], workDir),
    ])
    .then(function (spawnResults) {
      console.log("spawnResults:", spawnResults);

      // check if there was a problem
      var uniqueExitCodes = _.uniq(_.pluck(spawnResults, "exitCode"));
      console.log("uniqueExitCodes:", uniqueExitCodes);
      if (uniqueExitCodes.length !== 1 || uniqueExitCodes[0] !== 0) {
        throw new Error("Writing files failed (exit code not 0)");
      }

      // save this result for use in a future chained promise
      self.testSamplePath = spawnResults[0].stdoutPath;
      var sampleGroupPath = spawnResults[1].stdoutPath;

      // // pulled from upDownGenes.sh
      // # arg 1: matrix file
      // # arg 2: default 1.5
      // /usr/bin/Rscript outlier.R mRNA.NBL.POG.pancan.combat.5.tab 2

      var outlierGenesPath = getSetting("calculate_outlier_genes");

      return spawnCommand("Rscript", [
        outlierGenesPath,
        sampleGroupPath,
        self.job.args.iqr_multiplier,
      ], workDir);
    })
    .then(function (commandResult) {
      if (commandResult.exitCode !== 0) {
        throw new Error("Error code running up/down genes Rscript");
      }

      return spawnCommand("/bin/sh", [
        getSetting("outlier_analysis"),
        self.testSamplePath
      ], workDir);
    })
    .then(Meteor.bindEnvironment(function (commandResult) {
      console.log("done with single sample analysis");
      console.log("commandResult:", commandResult);

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

JobClasses.UpDownGenes = UpDownGenes;
