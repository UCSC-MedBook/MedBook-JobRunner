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

  var exportScript = getSetting("expression3_export");
  Q.all([
      // single sample data
      spawnCommand(exportScript, [
        "--study_label", self.job.args.study_label,
        "--sample_label", self.job.args.sample_label,
      ], workDir),
      // sample group data
      spawnCommand(exportScript, [
        "--sample_group_id", self.job.args.sample_group_id,
      ], workDir),
    ])
    .then(function (spawnResults) {
      // save this result for use in a future chained promise
      self.testSamplePath = spawnResults[0].stdoutPath;
      var sampleGroupPath = spawnResults[1].stdoutPath;

      // // pulled from upDownGenes.sh
      // # arg 1: matrix file
      // # arg 2: default 1.5
      // /usr/bin/Rscript outlier.R mRNA.NBL.POG.pancan.combat.5.tab 2

      var rscript = getSetting("rscript");
      var outlierGenesPath = getSetting("calculate_outlier_genes");

      return spawnCommand(rscript, [
        outlierGenesPath,
        sampleGroupPath,
        1.5
      ], workDir);
    })
    .then(function (commandResult) {
      if (commandResult.exitCode !== 0) {
        throw new Error("Error code running up/down genes Rscript");
      }

      var sh = getSetting("sh");
      var outlierAnalysis = getSetting("outlier_analysis");

      return spawnCommand(sh, [
        outlierAnalysis,
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
      var upBlob = Blobs.insert(upPath);
      var downBlob = Blobs.insert(downPath);

      // parse strings
      var output = {};
      _.each([
        { name: "upGenes", fileString: fs.readFileSync(upPath, "utf8") },
        { name: "downGenes", fileString: fs.readFileSync(downPath, "utf8") },
      ], function (outlier) {
        var lineArray = outlier.fileString.split("\n");
        var filteredLines = _.filter(lineArray, function (line) {
          return line !== "";
        });

        // loop for each line
        output[outlier.name] = _.map(filteredLines, function (line) {
          console.log("line:", line);
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
