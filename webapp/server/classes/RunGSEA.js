function RunGSEA (job_id) {
  Job.call(this, job_id);
}
RunGSEA.prototype = Object.create(Job.prototype);
RunGSEA.prototype.constructor = RunGSEA;

RunGSEA.prototype.run = function () {
  // create paths for files on the disk
  // NOTE: GSEA will not run if the path for any of the arguments has a dash
  // in it. Use temporary folders at /tmp/RunGSEA_[job_id]
  // """

  var workDir = "/tmp/" + "RunGSEA_" + this.job._id;

  try {
    fs.mkdirSync(workDir);
  } catch (e) {
    console.log("Pretty sure you reran the job: {$set: { status: 'waiting' }}");
    console.log("error:", e);
    throw e;
  }

  console.log("workDir: ", workDir);

  // create a sample group which is the combination of the two sample groups
  // so that we can easily write out a file

  var groupA = SampleGroups.findOne(this.job.args.sample_group_a_id);
  var groupB = SampleGroups.findOne(this.job.args.sample_group_b_id);

  // combine samples of same data set into single array
  var dataSetHash = {};
  _.each(groupA.data_sets.concat(groupB.data_sets), function (dataSet) {
    // check if we've seen this data set already
    var seenAlready = dataSetHash[dataSet.data_set_id];
    if (!seenAlready) {
      // if we haven't, set it up
      seenAlready = {
        data_set_name: dataSet.data_set_name,
        sample_labels: [],
      };
    }

    // combine the samples together
    seenAlready.sample_labels =
        seenAlready.sample_labels.concat(dataSet.sample_labels)
    dataSetHash[dataSet.data_set_id] = seenAlready;
  });
  var comboSampleGroupDataSets = _.map(dataSetHash,
      function (samplesAndName, data_set_id) {
    return {
      data_set_id: data_set_id,
      data_set_name: samplesAndName.data_set_name,
      sample_labels: samplesAndName.sample_labels,

      // I think we can fake this
      unfiltered_sample_count: 1,
    };
  });

  console.log("comboSampleGroupDataSets:", comboSampleGroupDataSets);

  var comboSampleGroupId = SampleGroups.insert({
    name: "temp - created in RunGSEA to call an adapter",
    version: 1,
    data_sets: comboSampleGroupDataSets,
    value_type: groupA.value_type,

    // invisible
    collaborations: [],
  });

  // star the promise chain: woohoo!

  var self = this;
  var deferred = Q.defer();

  // define up here so as to be available throughout promise chain (so that
  // we can skip a .then block)
  var geneSetCollectionPath;
  var gseaOutput = path.join(workDir, "gseaOutput");
  var geneSetCollectionPath = path.join(workDir, "gene_set.gmt");

  Q.all([
      // write mongo data to files

      // expression data to a file for use in GSEA
      spawnCommand(getSetting("gene_expression_export"), [
        "--plc", "--sample_group_id", comboSampleGroupId,
      ], workDir),
      // phenotype file for Limma
      spawnCommand(getSetting("limma_phenotype_export"), [
        "--cls",
        this.job.args.sample_group_a_id,
        this.job.args.sample_group_b_id
      ], workDir),
      // gene sets file for GSEA
      spawnCommand(getSetting("gene_set_collection_export"), [
        self.job.args.gene_set_collection_id,
      ], workDir, { stdoutPath: geneSetCollectionPath }),
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
      var gseaPhenotypePath = spawnResults[1].stdoutPath;

      // run GSEA
      var contrastName = groupA.name + " vs. " + groupB.name;

      return spawnCommand("java", [
        "-Xmx6G",
        "-cp", getSetting("gseaOnly_path"),
        "-res", expressionDataPath,
        "-cls", gseaPhenotypePath,
        "-gmx", geneSetCollectionPath,
        "-cp", getSetting("gsea_jar_path"),
        "-rpt_label", contrastName,
        "-set_max", "500",
        "-set_min", "15",
        "-nperm", "1000",
        "-plot_top_x", "20",
        "-metric", "Signal2Noise",
        "-out", gseaOutput,
        "-mode", "max_probe",
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
      // remove the temporary sample group (also do this if it fails)
      // Do this down here because I don't feel like wrapping another .then
      // in a callback.
      SampleGroups.remove(comboSampleGroupId);

      // use the ls result to insert all of the blobs
      var outputString = fs.readFileSync(result.stdoutPath, "utf8");
      var outputFileNames = _.filter(outputString.split("\n"),
          function (fileName) {
        return !!fileName && fileName.slice(-1) !== "/";
      });

      console.log("inserting GSEA result blobs...");
      var blobPromises = [];
      _.each(outputFileNames, function(fileName) {
        var def = Q.defer();
        blobPromises.push(def.promise);

        Blobs2.create(path.join(gseaOutput, fileName), {
          collection_name: "Jobs",
          mongo_id: self.job._id,
        }, function (err, out) {
          if (err) {
            console.log("err:", err);
            def.reject("Error inserting blob: " + fileName);
          } else {
            def.resolve();
          }
        });
      });

      Q.all(blobPromises).done(function (values) {
        console.log("inserted all blobs");
        deferred.resolve({});
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
