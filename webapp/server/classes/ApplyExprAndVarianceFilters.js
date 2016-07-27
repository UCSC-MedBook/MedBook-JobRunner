
function ApplyExprAndVarianceFilters (job_id) {
  Job.call(this, job_id);
}

ApplyExprAndVarianceFilters.prototype = Object.create(Job.prototype);
ApplyExprAndVarianceFilters.prototype.constructor = ApplyExprAndVarianceFilters;

ApplyExprAndVarianceFilters.prototype.run = function () {

  var workDir = ntemp.mkdirSync("ApplyExprAndVarianceFilters");
  console.log("ApplyExprAndVarianceFilters: workDir: ", workDir);

  var self = this;
  var sample_group_id = self.job.args.sample_group_id;
  console.log("using sgid", sample_group_id); // XXX 

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
    console.log("export command ran with results", exportResults);
    if(exportResults.exitCode !== 0){
      // TODO print stderr for the command
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
      // TODO, if exit code was 1, throw error.
      // TODO print stderr for the command

      
      
  
      // TODO TODO
      // Run the variance filter here and add another then block
      // For now, just upload it with only expression level filtering

      return "variance filter results go here";

    }).then(Meteor.bindEnvironment(function(varResult){
    // Create the final Blob2, then resolve the promise.

    console.log("not sure what varresult is", varResult);

      var associated_samplegroup = {
        collection_name: "SampleGroups",
        mongo_id: sample_group_id,
      };

      var createBlob2Sync = Meteor.wrapAsync(Blobs2.create);
      // Errors from this will be thrown to the catch below
      var results = createBlob2Sync(self.filteredByExpressionPath, associated_samplegroup, {});
      console.log("made blob2 with results", results);




      // Everything worked; resolve the promise
      console.log("apply expr async finished, resolving...now"); // XXX
      deferred.resolve();
    },deferred.reject())).catch(function(error){ 
      // If we got an error anywhere along the chain,
      // fail the job
      deferred.reject(error);
    });

  console.log("apply expr job ran. Just waiting on the deferred now. "); // XXX

  // Will wait for the async code to run and either resolve or reject
  // before completing the job
  return deferred.promise;
};

JobClasses.ApplyExprAndVarianceFilters = ApplyExprAndVarianceFilters ;
