
function ApplyExprAndVarianceFilters (job_id) {
  Job.call(this, job_id);
}

ApplyExprAndVarianceFilters.prototype = Object.create(Job.prototype);
ApplyExprAndVarianceFilters.prototype.constructor = ApplyExprAndVarianceFilters;

ApplyExprAndVarianceFilters.prototype.run = function () {
  // Set up the working directory
  var workDir = ntemp.mkdirSync("ApplyExprAndVarianceFilters");
  console.log("workDir: ", workDir);

  console.log("Running apply expr job! TODO implement me");

// TODO
//  var deferred = Q.defer();
//  var self = this;
//
//  // export the sample group info
//  Q.fcall(function(){
//
//    // returns "first"
//  }).then(
//    // Apply the filters
//   function(res){}, function(err){} 
//  ); // TODO

  // then
  // re-upload the result as a blob associated with the sample group
   
};

JobClasses.ApplyExprAndVarianceFilters = ApplyExprAndVarianceFilters ;
