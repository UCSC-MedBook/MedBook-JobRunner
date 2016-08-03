
function ApplyExprAndVarianceFilters (job_id) {
  Job.call(this, job_id);
}

ApplyExprAndVarianceFilters.prototype = Object.create(Job.prototype);
ApplyExprAndVarianceFilters.prototype.constructor = ApplyExprAndVarianceFilters;

ApplyExprAndVarianceFilters.prototype.run = function () {

  var workDir = ntemp.mkdirSync("ApplyExprAndVarianceFilters");
  console.log("workDir: ", workDir);

  var self = this;
  var sample_group_id = self.job.args.sample_group_id;

  var exportScript = getSetting("genomic_expression_export");
  var python = getSetting("python");
  var exprFilterScript = getSetting("expression_level_gene_filter");
  var varianceFilterScript = getSetting("variance_gene_filter");

  var deferred = Q.defer();

  // exportCommand is a promise for exporting the
  // sample group data
  var exportCommand = spawnCommand(exportScript, [
      "--sample_group_id", sample_group_id,
    ], workDir)  

  // Export the data
  exportCommand.then(function(exportResults){ 
    if(exportResults.exitCode !== 0){
      throw new Error("Writing file failed (exit code not 0)");
    }
    // input & output paths for expression level filter
    self.sampleGroupPath = exportResults.stdoutPath;
    self.filteredByExpressionPath = path.join(workDir, "sampleGroup_with_expr_filter_applied.tsv");

      return spawnCommand(python,
        [
          exprFilterScript,
          "--in_file", self.sampleGroupPath,
          "--proportion_unexpressed", "0.8",
          "--out_file", self.filteredByExpressionPath,
        ],
        workDir);
 
    }).then(function(exprFilterResults){
      console.log("expression level filter ran with results", exprFilterResults);
      if(exprFilterResults.exitCode !== 0){
        throw new Error("Failed to apply expression-level filter (exit code not 0)");
      }
      // set up variance filter

      // End users will see custom path that's set in patientCare when downloading
      // but internally this path is used.
      self.fullyFilteredPath = path.join(workDir, "sampleGroup_filteredByExprAndVar.tsv");

      return spawnCommand(python,
        [
          varianceFilterScript,
          "--in_file", self.filteredByExpressionPath,
          "--filter_level", "0.2",
          "--out_file", self.fullyFilteredPath,
        ],
        workDir); 

    }).then(Meteor.bindEnvironment(function(varianceFilterResults){
      if(varianceFilterResults.exitCode !== 0){
        throw new Error("Failed to apply variance filter (exit code not 0)");
      }

      // Filters were applied; create the output Blob2

      var associated_samplegroup = {
        collection_name: "SampleGroups",
        mongo_id: sample_group_id,
      };

      var createBlob2Sync = Meteor.wrapAsync(Blobs2.create);
      // Errors from this will be thrown to the catch below
      var metadata = {"type" : "ExprAndVarFilteredSampleGroupData"}
      var blob = createBlob2Sync(self.fullyFilteredPath, associated_samplegroup, metadata);
      var output = {"filtered_samples_blob_id" : blob._id};

      // Everything worked; resolve the promise
      deferred.resolve(output);
    },function(err){
      deferred.reject(err);
    })).catch(function(error){ 
      // If we got an error anywhere along the chain,
      // fail the job
      deferred.reject(error);
    });
  // Will wait for the async code to run and either resolve or reject
  // before completing the job
  return deferred.promise;
};

JobClasses.ApplyExprAndVarianceFilters = ApplyExprAndVarianceFilters ;
