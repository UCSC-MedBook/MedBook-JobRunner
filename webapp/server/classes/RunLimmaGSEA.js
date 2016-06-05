function RunLimmaGSEA (job_id) {
  Job.call(this, job_id);
}
RunLimmaGSEA.prototype = Object.create(Job.prototype);
RunLimmaGSEA.prototype.constructor = RunLimmaGSEA;

RunLimmaGSEA.prototype.run = function () {
  // create paths for files on the disk
  var workDir = ntemp.mkdirSync("RunLimma");
  console.log("workDir: ", workDir);

  // create a sample group which is the combination of the two sample groups
  // so that we can easily write out a file

  var groupA = SampleGroups.findOne(this.job.args.sample_group_a_id);
  var groupB = SampleGroups.findOne(this.job.args.sample_group_b_id);

  // combine samples of same data set into single array
  var dataSetHash = {};
  _.each(groupA.data_sets.concat(groupB.data_sets), function (dataSet) {
    var oldSamples = dataSetHash[dataSet.data_set_id];
    if (!oldSamples) {
      oldSamples = [];
    }

    dataSetHash[dataSet.data_set_id] = oldSamples.concat(dataSet.sample_labels);
  });
  var comboSampleGroupDataSets = _.map(dataSetHash,
      function (sample_labels, data_set_id) {
    return {
      data_set_id: data_set_id,
      sample_labels: sample_labels,
    };
  });

  var comboSampleGroupId = SampleGroups.insert({
    name: "temp",
    version: 1,
    collaborations: [], // invisible
    data_sets: comboSampleGroupDataSets,
  });

  // star the promise chain: woohoo!

  var self = this;
  var deferred = Q.defer();

  // define up here so as to be available throughout promise chain (so that
  // we can skip a .then block)
  var geneSetCollectionPath;
  // Limma output files
  var modelFitPath = path.join(workDir, "model_fit.tab");
  var topGenePath = path.join(workDir, "Topgene.rnk");
  var voomPlotPath = path.join(workDir, "mds.pdf");
  var gseaOutput = path.join(workDir, "gseaOutput");

  Q.all([
      // write mongo data to files

      // expression data to a file for use in Limma
      spawnCommand(getSetting("gene_expression_export"), [
        "--sample_group_id", comboSampleGroupId,
      ], workDir),
      // phenotype file for Limma
      spawnCommand(getSetting("limma_phenotype_export"), [
        this.job.args.sample_group_a_id,
        this.job.args.sample_group_b_id
      ], workDir),
      // gene sets file for GSEA
      spawnCommand(getSetting("gene_set_collection_export"), [
        self.job.args.gene_set_collection_id,
      ], workDir),
    ])
    .then(function (spawnResults) {
      console.log("done writing files");

      _.each(spawnResults, function (result) {
        if (result.exitCode !== 0) {
          throw "Problem writing files to disk.";
        }
      });

      // save the file paths... order maters for spawnResults
      var expressionDataPath = spawnResults[0].stdoutPath;
      var limmaPhenotypePath = spawnResults[1].stdoutPath;
      geneSetCollectionPath = spawnResults[2].stdoutPath; // outer block scope

      // run Limma
      return spawnCommand("Rscript", [
        getSetting("limma_path"),
        expressionDataPath,
        limmaPhenotypePath,
        self.job.args.limma_top_genes_count,
        "BH", // "BH" or "none"
        modelFitPath,
        topGenePath,
        voomPlotPath,
      ], workDir);
    })
    .then(function (limmaResult) {
      if (limmaResult.exitCode !== 0) {
        throw "Problem running limma";
      }

      // run GSEA
      var contrastName = groupA.name + " vs. " + groupB.name;

      return spawnCommand(getSetting("gsea_path"), [
        "--input_tab", topGenePath,
        "--builtin_gmt", geneSetCollectionPath,
        "--gsea_jar", getSetting("gsea_jar_path"),
        "--adjpvalcol", "5",
        "--signcol", "2",
        "--idcol", "1",
        "--outhtml", "index.html",
        "--input_name", contrastName,
        "--setMax", "500",
        "--setMin", "15",
        "--nPerm", "1000",
        "--plotTop", "20",
        "--output_dir", gseaOutput,
        // "--mode", "Max_probe",
        // "--title", contrastName
      ], workDir);
    })
    .then(function (result) {
      if (result.exitCode !== 0) {
        throw "Problem running GSEA";
      }

      // "F" is to put a "/" at the end of every folder name
      return spawnCommand("ls", [ "-1F", gseaOutput ], workDir);
    })
    // can't add another .then: Meteor.bindEnvironment returns immidiately
    .then(Meteor.bindEnvironment(function (result) {
      var outputString = fs.readFileSync(result.stdoutPath, "utf8");
      var outputFileNames = _.filter(outputString.split("\n"),
          function (fileName) {
        return !!fileName && fileName.slice(-1) !== "/";
      });

      _.each(outputFileNames, function(fileName) {
        var blob = Blobs.insert(path.join(gseaOutput, fileName));

        Blobs.update({ _id: blob._id }, {
          $set: {
            "metadata.job_id": self.job._id,
            "metadata.tool_label": "gsea",
            "metadata.file_path": fileName,
          }
        });
      });
      console.log("inserted all blobs");

      // remove the temporary sample group (also do this if it fails)
      // Do this down here because I don't feel like wrapping another .then
      // in a callback.
      SampleGroups.remove(comboSampleGroupId);

      deferred.resolve({});
    }, deferred.reject))
    .catch(Meteor.bindEnvironment(function (reason) {
      // always remove the created sample group even if it fails
      SampleGroups.remove(comboSampleGroupId);

      deferred.reject(reason);
    }, deferred.reject));
  return deferred.promise;
};

JobClasses.RunLimmaGSEA = RunLimmaGSEA;
