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
    contrastId: {
      type: String,
    },
    correction: {
      type: String,
      allowedValues: [
        "BH"
      ]
    },
  }));

  // create paths for files on the disk
  var workDir = ntemp.mkdirSync("RunLimma");
  console.log("workDir: ", workDir);

  // prepare to write files
  var expressionPath = path.join(workDir, "expdata.tab");
  var phenoPath = path.join(workDir, "pheno.tab");
  var contrast = Contrasts.findOne(this.job.args.contrastId);
  var expressionSamples = _.flatten([contrast.a_samples, contrast.b_samples]);

  // output files
  var sigPath = path.join(workDir, "model_fit.tab");
  var topGenePath = path.join(workDir, "Topgene.tab");
  var plotPath = path.join(workDir, "mds.pdf");
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
        self.job.args.correction,
        sigPath,
        topGenePath,
        plotPath
      ], workDir);
    })
    .then(function (commandResult) {
      console.log("commandResult:", commandResult);

      function setMetadata (blob, otherMetadata) {
        Blobs.update(blob._id, {
          $set: _.extend({
            "metadata.user_id": self.job.user_id,
          }, otherMetadata)
        })
      }



      // // load in blobs
      // var blob = Blobs.insert(item);
      // var my_user_id = self.job.user_id
      // Blobs.update({_id:blob._id}, {$set:{"metadata.user_id":my_user_id}});
    })
    .then(deferred.resolve)
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
//         correction: "BH",
//     },
//     "status" : "waiting",
//     "timeout_length" : 6.048e+08,
//     "prerequisite_job_ids" : [],
//     "date_created" : ISODate("2016-01-09T16:10:11.706Z"),
//     "date_modified" : ISODate("2016-01-09T16:10:11.706Z"),
//     "retry_count" : 0
// })
