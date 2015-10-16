function Job (job_id) {
  var job = Jobs.findOne(job_id);
  if (job) {
    this.job = {};
    _.extend(this.job, Jobs.findOne(job_id));
  } else {
    throw "Invalid job_id";
  }

  this.reasonForRetry = false;
}
Job.prototype.run = function() {
  console.log("running job: " + this.job._id + "\t" + this.job.name);
};
Job.prototype.retry = function(reasonForRetry) {
  // TODO: this needs documentation big time...
  if (!reasonForRetry) {
    reasonForRetry = "unknown reason";
  }
  console.log("setting reasonForRetry to", reasonForRetry);
  this.reasonForRetry = reasonForRetry;
};
Job.prototype.onError = function(e) {
  console.log("Error: internal error running job");
};
Job.prototype.onSuccess = function () {
  Jobs.update(this.job._id, {
    $set: { status: "done" }
  });
};


function WranglerFileJob (job_id) {
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
}
WranglerFileJob.prototype = Object.create(Job.prototype);
WranglerFileJob.prototype.constructor = WranglerFileJob;
WranglerFileJob.prototype.run = function () {
  Job.prototype.run.call(this);

  // set the status to processing
  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      "status": "processing",
    }
  });
};
WranglerFileJob.prototype.onError = function (e) {
  var wrangler_file_id = this.job.args.wrangler_file_id;
  if (wrangler_file_id) {
    WranglerFiles.update(wrangler_file_id, {
      $set: {
        status: "error",
        error_description: "Error running job: " + e.toString(),
      }
    });
  }
};
WranglerFileJob.prototype.onSuccess = function (result) {
  Job.prototype.onSuccess.call(this, result);

  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      status: "done"
    }
  });
};


function GuessWranglerFileType (job_id) {
  WranglerFileJob.call(this, job_id);
}
GuessWranglerFileType.prototype = Object.create(WranglerFileJob.prototype);
GuessWranglerFileType.prototype.constructor = GuessWranglerFileType;
GuessWranglerFileType.prototype.run = function () {
  WranglerFileJob.prototype.run.call(this);

  // differentiate by file name, etc.
  var blobName = this.blob.original.name;
  function extensionEquals(extension) {
    return blobName.slice(-extension.length) === extension;
  }

  var self = this;
  var options = this.wranglerFile.options;
  if (options === undefined) {
    options = {};
  }
  function setFileOptions(newOptions) {
    _.extend(options, newOptions); // changes options
    WranglerFiles.update(self.wranglerFile._id, {
      $set: {
        "options": options
      }
    });
  }

  // try to guess file_type
  if (extensionEquals(".vcf")) {
    setFileOptions({ file_type: "mutationVCF" });
  }
  if (blobName.match(/\.rsem\.genes\.[a-z_]*\.tab/g)) {
    setFileOptions({ file_type: "BD2KGeneExpression" });
  }

  // try to guess normalization
  if (blobName.match(/raw_counts/g)) {
    setFileOptions({ normalization: "raw_counts" });
  } else if (blobName.match(/norm_counts/g)) {
    setFileOptions({ normalization: "counts" });
  } else if (blobName.match(/norm_tpm/g)) {
    setFileOptions({ normalization: "tpm" });
  } else if (blobName.match(/norm_fpkm/g)) {
    setFileOptions({ normalization: "fpkm" });
  }
};
GuessWranglerFileType.prototype.onSuccess = function (result) {
  // NOTE: skips over direct prototype
  Job.prototype.onSuccess.call(this, result);
};


function ParseWranglerFile (job_id) {
  WranglerFileJob.call(this, job_id);
}
ParseWranglerFile.prototype = Object.create(WranglerFileJob.prototype);
ParseWranglerFile.prototype.constructor = ParseWranglerFile;
ParseWranglerFile.prototype.run = function () {
  WranglerFileJob.prototype.run.call(this);

  console.log("time to do some processing!");
};


JobClasses = {
  Job: Job,
  WranglerFileJob: WranglerFileJob,
  GuessWranglerFileType: GuessWranglerFileType,
  ParseWranglerFile: ParseWranglerFile,
};
