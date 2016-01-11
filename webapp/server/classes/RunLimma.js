function RunLimma (job_id) {
  Job.call(this, job_id);
}
RunLimma.prototype = Object.create(Job.prototype);
RunLimma.prototype.constructor = RunLimma;

RunLimma.prototype.run = function () {
  check(this.job.args, new SimpleSchema({
    topGeneCount: {
      type: Number,
      min: 1,
    },
    contrast_label: {
      type: String,
    },
    contrast_version: {
      type: Number,
    },
    correction_method: {
      type: String,
      allowedValues: [
        "BH",
        "none"
      ]
    },
  }));

  // create paths for files on the disk
  var workDir = ntemp.mkdirSync("RunLimma");
  console.log("workDir: ", workDir);

  // prepare to write files
  var expressionPath = path.join(workDir, "expdata.tab");
  var phenoPath = path.join(workDir, "pheno.tab");
  var contrast = Contrasts.findOne({
    contrast_label: this.job.args.contrast_label,
    version: this.job.args.contrast_version,
  });
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
        self.job.args.correction_method,
        modelFitPath,
        topGenePath,
        voomPlotPath
      ], workDir);
    })
    .then(Meteor.bindEnvironment(function (commandResult) {
      console.log("commandResult:", commandResult);

      function setMetadata (blob, otherMetadata) {
        Blobs.update(blob._id, {
          $set: _.extend({
            "metadata.user_id": self.job.user_id,
          }, otherMetadata)
        })
      }

      function addBlob(blobPath) {
        var deferred = Q.defer();

        var blob = Blobs.insert(blobPath);
        Q(blob)
          .delay(1000)
          .then(deferred.resolve)

        return deferred.promise;
      }

      if (commandResult.exitCode === 0) {
        // :D

        var modelFit = Blobs.insert(modelFitPath);
        var topGeneSignature = Blobs.insert(topGenePath);
        var voomPlot = Blobs.insert(voomPlotPath);
        setMetadata(modelFit);
        setMetadata(topGeneSignature, {
          "metadata.wrangler_file_type": "LimmaSignature"
        });
        setMetadata(voomPlot);

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
        // slurp up stderr, stdout
        var stdout = Blobs.insert(commandResult.stdoutPath);
        var stderr = Blobs.insert(commandResult.stderrPath);
        setMetadata(stdout);
        setMetadata(stderr);

        deferred.resolve({
          result: "Error code " + commandResult.exitCode,
          blobs: [
            {
              name: "Command output (stdout)",
              blob_id: stdout._id
            },
            {
              name: "Command error output (stderr)",
              blob_id: stderr._id
            },
          ],
        });
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
