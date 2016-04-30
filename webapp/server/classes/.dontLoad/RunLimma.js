function RunLimma (job_id) {
  Job.call(this, job_id);
}
RunLimma.prototype = Object.create(Job.prototype);
RunLimma.prototype.constructor = RunLimma;

RunLimma.prototype.run = function () {
  // create paths for files on the disk
  var workDir = ntemp.mkdirSync("RunLimma");
  console.log("workDir: ", workDir);

  // prepare to write files
  var expressionPath = path.join(workDir, "expdata.tab");
  var phenoPath = path.join(workDir, "pheno.tab");

  var expressionSamples = _.flatten([contrast.a_samples, contrast.b_samples]);

  // output files
  var modelFitPath = path.join(workDir, "model_fit.tab");
  var topGenePath = path.join(workDir, "Topgene.tab");
  var voomPlotPath = path.join(workDir, "mds.pdf");
  // var voomPath = path.join(workDir, "voom.pdf");

  var deferred = Q.defer();
  var self = this;
  Q.all([
      new Export.LimmaPhenotype().run(phenoPath, {
        contrastId: contrast._id
      }),
      new Export.GeneExpressionMatrix().run(expressionPath, {
        samples: expressionSamples
      })
    ])
    .then(function () {
      var limmaPath = getSetting("limma_path");

      return spawnCommand("Rscript", [
        limmaPath,
        expressionPath,
        phenoPath,
        self.job.args.topGeneCount,
        "BH", // "BH" or "none"
        modelFitPath,
        topGenePath,
        voomPlotPath
      ], workDir);
    })
    .then(Meteor.bindEnvironment(function (commandResult) {
      console.log("commandResult:", commandResult);

      if (commandResult.exitCode === 0) {
        // :D

        var modelFit = Blobs.insert(modelFitPath);
        var topGeneSignature = Blobs.insert(topGenePath);
        var voomPlot = Blobs.insert(voomPlotPath);
        setBlobMetadata(modelFit, self.job.user_id);
        setBlobMetadata(topGeneSignature, self.job.user_id, {
          "metadata.wrangler_file_options": {
            file_type: "LimmaSignature",
            update_or_create: "create",
            algorithm: "limma",
            features_type: "genes",
          },
        });
        setBlobMetadata(voomPlot, self.job.user_id);

        deferred.resolve({
          result: "Success",
          blobs: [
            {
              name: "Model fit",
              blob_id: modelFit._id
            },
            {
              name: "Top gene signature",
              blob_id: topGeneSignature._id
            },
            {
              name: "voom: Mean−variance trend",
              blob_id: voomPlot._id
            },
          ],
        });
      } else {
        spawnedCommandFailedResolve.call(self, commandResult, deferred);
      }
    }, deferred.reject))
    .catch(deferred.reject);
  return deferred.promise;
};

JobClasses.RunLimma = RunLimma;

// db.getCollection('jobs').insert({
//     "name" : "RunLimma",
//     "user_id" : "45Wx5KgCMqvSNBt5G",
//     "args" : {
//         "contrastId" : "sWAmitXcb7rBgBE8c",
//         topGeneCount: 5000,
//         correction_method: "BH",
//     },
//     "status" : "waiting",
//     "timeout_length" : 6.048e+08,
//     "prerequisite_job_ids" : [],
//     "date_created" : ISODate("2016-01-09T16:10:11.706Z"),
//     "date_modified" : ISODate("2016-01-09T16:10:11.706Z"),
//     "retry_count" : 0
// })
