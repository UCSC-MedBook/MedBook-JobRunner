// TODO: remove these from global namespace

Job = function (job_id) {
  this.job = Jobs.findOne(job_id);
  if (!this.job) {
    throw "Invalid job_id";
  }

  this.reasonForRetry = false;
};
Job.prototype.run = function() {
  console.log("run has not been overridden in the job");
};
Job.prototype.retry = function(reasonForRetry) {
  // TODO: this needs documentation big time... or maybe needs to be changed...
  if (!reasonForRetry) {
    reasonForRetry = "Retried for unknown reason";
  }
  this.reasonForRetry = reasonForRetry;
};
Job.prototype.onError = function(e) {
  console.log("onError has not been overridden in the job");
};
Job.prototype.onSuccess = function () {
  console.log("onSuccess has not been overridden in the job");
};

WranglerFileJob = function (job_id) {
  Job.call(this, job_id);

  this.wranglerFile = WranglerFiles.findOne(this.job.args.wrangler_file_id);
  if (!this.wranglerFile) {
    throw "Invalid wrangler_file_id";
  }

  this.blob = Blobs.findOne(this.wranglerFile.blob_id);
  if (this.blob) {
    if (!this.blob.hasStored("blobs")) {
      this.retry("blob hasn't stored yet");
    }
  } else {
    throw "Invalid blob_id";
  }
};
WranglerFileJob.prototype = Object.create(Job.prototype);
WranglerFileJob.prototype.constructor = WranglerFileJob;

JobClasses = {};
