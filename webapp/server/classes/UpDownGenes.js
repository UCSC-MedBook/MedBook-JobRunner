function UpDownGenes (job_id) {
  Job.call(this, job_id);
}
UpDownGenes.prototype = Object.create(Job.prototype);
UpDownGenes.prototype.constructor = UpDownGenes;

UpDownGenes.prototype.run = function () {
  // create paths for files on the disk
  var workDir = ntemp.mkdirSync("UpDownGenes");
  console.log("workDir: ", workDir);

  // prepare to write files
  var cohortExpressionPath = path.join(workDir, "expdata.tab");
  // as specified by the up_down_genes script that uses this file
  var testSamplePath = path.join(workDir, "test_sample_gene_expression.txt");

  // output files
  var expressionUpPath = path.join(workDir, "expression_up_outliers.tsv");
  var expressionDownPath = path.join(workDir, "expression_down_outliers.tsv");

  var deferred = Q.defer();
  var self = this;
  Q.all([
      // write the cohort expression file
      new Export.GeneExpressionMatrix().run(cohortExpressionPath, {
        samples: self.job.args.reference_samples
      }),
      // write the single sample expression file
      new Export.GeneExpressionMatrix().run(testSamplePath, {
        samples: self.job.args.reference_samples
      }),
    ])
    .then(function () {
      // // pulled from upDownGenes.sh
      // # arg 1: matrix file
      // # arg 2: default 1.5
      // /usr/bin/Rscript outlier.R mRNA.NBL.POG.pancan.combat.5.tab 2

      var rscript = getSetting("rscript");
      var outlierGenesPath = getSetting("calculate_outlier_genes");

      return spawnCommand(rscript, [
        outlierGenesPath,
        cohortExpressionPath,
        1.5
      ], workDir);
    })
    .then(Meteor.bindEnvironment(function (commandResult) {
      console.log("commandResult:", commandResult);

      if (commandResult.exitCode !== 0) {
        spawnedCommandFailedResolve.call(self, commandResult, deferred);
        return;
      }

      var sh = getSetting("sh");
      var upDownGenes = getSetting("up_down_genes");

      // don't have to return anything because there's no then
      spawnCommand(sh, [
        upDownGenes,
      ], workDir)
        .then(Meteor.bindEnvironment(function (commandResult) {
          if (commandResult.exitCode !== 0) {
            spawnedCommandFailedResolve.call(self, commandResult, deferred);
            return;
          }

          // done!

          var expressionUp = Blobs.insert(expressionUpPath);
          var expressionDown = Blobs.insert(expressionDownPath);
          setBlobMetadata(expressionUp, self.job.user_id);
          setBlobMetadata(expressionDown, self.job.user_id);

          deferred.resolve({
            result: "Success",
            blobs: [
              {
                name: "Expression up outliers",
                blob_id: expressionUp._id
              },
              {
                name: "Expression down outliers",
                blob_id: expressionDown._id
              },
            ],
          });
        }, deferred.reject))
        .catch(deferred.reject);
    }, deferred.reject))
    // NOTE: Meteor.bindEnvironment returns immidiately, meaning we can't
    // quite use the nice promise syntax of chainging .thens
    .catch(deferred.reject);
  return deferred.promise;
};

JobClasses.UpDownGenes = UpDownGenes;
