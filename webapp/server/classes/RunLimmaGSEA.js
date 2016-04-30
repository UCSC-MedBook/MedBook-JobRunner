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

  // combine samples of same study into single array
  var studyHash = {};
  _.each(groupA.studies.concat(groupB.studies), function (study) {
    console.log("study:", study);
    var oldSamples = studyHash[study.study_label];
    if (!oldSamples) {
      oldSamples = [];
    }

    studyHash[study.study_label] = oldSamples.concat(study.sample_labels);
  });
  var comboSampleGroupStudies = _.map(studyHash,
      function (sample_labels, study_label) {
    return {
      study_label: study_label,
      sample_labels: sample_labels,
    };
  });

  var comboSampleGroupId = SampleGroups.insert({
    name: "temp",
    version: 1,
    collaborations: [], // invisible
    studies: comboSampleGroupStudies,
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

  Q.all([
      // write mongo data to files

      // expression data to a file for use in Limma
      spawnCommand(getSetting("expression3_export"), [
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
      console.log("done running Limma", limmaResult);
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
        "--output_dir", workDir,
        // "--mode", "Max_probe",
        // "--title", contrastName
      ], workDir);
    })
    // can't add another .then: Meteor.bindEnvironment returns immidiately
    .then(Meteor.bindEnvironment(function (result) {
      console.log("done running GSEA:", result);

      if (result.exitCode !== 0) {
        throw "Problem running GSEA";
      }

      // remove the temporary sample group (also do this if it fails)
      SampleGroups.remove(comboSampleGroupId);

      // insert the blob and end the job. whew.
      var outputString = fs.readFileSync(result.stdoutPath, "utf8");
      var outputFileZip = outputString.slice(7, -1) + ".rpt.zip";

      deferred.resolve({
        gsea_report_zipped_blob_id: Blobs.insert(outputFileZip)._id,
      });
    }, deferred.reject))
    .catch(Meteor.bindEnvironment(function (reason) {
      // always remove the created sample group even if it fails
      SampleGroups.remove(comboSampleGroupId);

      deferred.reject(reason);
    }, deferred.reject));
  return deferred.promise;
};

JobClasses.RunLimmaGSEA = RunLimmaGSEA;
