function Job (job_id) {
  this.job = Jobs.findOne(job_id);
  if (!this.job) {
    throw "Invalid job_id";
  }

  this.reasonForRetry = false;
}
Job.prototype.run = function() {
  console.log("no run function defined");
};
Job.prototype.retry = function(reasonForRetry) {
  // TODO: this needs documentation big time... or maybe needs to be changed...
  if (!reasonForRetry) {
    reasonForRetry = "unknown reason";
  }
  console.log("setting reasonForRetry to", reasonForRetry);
  this.reasonForRetry = reasonForRetry;
};
Job.prototype.onError = function(e) {
  console.log("No onError function defined");
};
Job.prototype.onSuccess = function () {
  console.log("No onSuccess function defined");
};


function ensureWranglerFileIntegrity() {
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


function ParseWranglerFile (job_id) {
  Job.call(this, job_id);

  ensureWranglerFileIntegrity.call(this);
}
ParseWranglerFile.prototype = Object.create(Job.prototype);
ParseWranglerFile.prototype.constructor = ParseWranglerFile;
ParseWranglerFile.prototype.run = function () {
  var self = this;

  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      "status": "processing",
    }
  });

  // try to guess options that have not been manually specified
  var options = self.wranglerFile.options;
  if (options === undefined) {
    options = {};
  }
  function setFileOptions(newOptions) {
    _.extend(options, newOptions); // keeps options up to doate
    WranglerFiles.update(self.wranglerFile._id, {
      $set: {
        "options": options
      }
    });
  }

  // for guesses of file name
  var blobName = self.blob.original.name;
  function extensionEquals(extension) {
    return blobName.slice(-extension.length) === extension;
  }

  // try to guess file_type
  if (!options.file_type) {
    if (extensionEquals(".vcf")) {
      setFileOptions({ file_type: "MutationVCF" });
    }
    if (blobName.match(/\.rsem\.genes\.[a-z_]*\.tab/g)) {
      setFileOptions({ file_type: "BD2KGeneExpression" });
    }
  }

  // try to guess normalization
  if (!options.normalization) {
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
  }

  if (!options.file_type) {
    throw "file type could not be inferred";
  }

  var fileHandlerClass = FileHandlers[options.file_type];
  if (!fileHandlerClass) {
    throw "file handler not yet defined";
  }

  // figure out which FileHandler to create
  var fileHandler = new fileHandlerClass(self.wranglerFile._id, true);
  return fileHandler.parse();
};
ParseWranglerFile.prototype.onError = function (e) {
  WranglerFiles.update(this.job.args.wrangler_file_id, {
    $set: {
      status: "error",
      error_description: "Error running job: " + e.toString(),
    }
  });
};
ParseWranglerFile.prototype.onSuccess = function (result) {
  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      status: "done"
    }
  });
};


function SubmitWranglerFile (job_id) {
  Job.call(this, job_id);

  ensureWranglerFileIntegrity.call(this);
}
SubmitWranglerFile.prototype = Object.create(Job.prototype);
SubmitWranglerFile.prototype.constructor = SubmitWranglerFile;
SubmitWranglerFile.prototype.run = function () {
  // figure out which FileHandler to create
  var fileHandler = new FileHandlers[this.wranglerFile.options.file_type]
      (this.wranglerFile._id, false);
  return fileHandler.parse();
};
SubmitWranglerFile.prototype.onError = function (e) {
  // TODO: should this be the correct behaviour?
  console.log("How can we have an onError in SubmitWranglerFile after going " +
      "through ParseWranglerFile...");
  var wranglerFile = WranglerFiles.findOne(this.job.args.wrangler_file_id);
  WranglerSubmissions.update(wranglerFile.submission_id, {
    $addToSet: {
      errors: "Error running write job: " + e,
    }
  });
};
SubmitWranglerFile.prototype.onSuccess = function (result) {
  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      written_to_database: true,
    }
  });
};


function SubmitWranglerSubmission (job_id) {
  Job.call(this, job_id);

  this.submission = WranglerSubmissions.findOne(this.job.args.submission_id);
  if (!this.submission) {
    throw "Invalid submission_id";
  }
}
SubmitWranglerSubmission.prototype = Object.create(Job.prototype);
SubmitWranglerSubmission.prototype.constructor = SubmitWranglerSubmission;
SubmitWranglerSubmission.prototype.run = function () {
  var submission_id = this.submission._id;

  // remove all previous submission errors
  WranglerSubmissions.update(submission_id, { $set: { "errors": [] } });
  var errorCount = 0; // increased with addSubmissionError

  // define some helper functions
  function setSubmissionStatus (newStatus) {
    console.log("submission:", newStatus);
    WranglerSubmissions.update(submission_id, {$set: {"status": newStatus}});
  }
  function addSubmissionError (description) {
    if (errorCount < 25) {
      WranglerSubmissions.update(submission_id, {
        $addToSet: {
          "errors": description,
        }
      });
    }

    if (errorCount !== 0) { // no need to set it twice
      setSubmissionStatus("editing");
    }
    errorCount++;
  }

  // make sure each file is "done"
  WranglerFiles.find({submission_id: submission_id}).forEach(function (doc) {
    if (doc.status !== "done") {
      addSubmissionError("File not done: " + doc.blob_name);
    }
  });
  if (errorCount !== 0) {
    return;
  }

  // make sure there are some documents
  // NOTE: I'm assuming we have to have documents...
  var totalCount = WranglerDocuments
      .find({submission_id: submission_id})
      .count();
  if (totalCount === 0) {
    addSubmissionError("No documents present");
    return;
  }

  // make sure we have only one type of submission type
  var distinctSubmissionTypes = WranglerDocuments.aggregate([
        {$match: {submission_id: submission_id}},
        {$project: {submission_type: 1}},
        {
          $group: {
            _id: null,
            distinct_submission_types: {$addToSet: "$submission_type"}
          }
        },
      ])[0]
      .distinct_submission_types;
  if (distinctSubmissionTypes.length !== 1) {
    addSubmissionError("Mixed submission types");
    return;
  }

  // we have successfully verified that the submission is ready for writing!
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "writing"
    }
  });

  // add a bunch of jobs to write the files to the database
  var self = this;
  var writingJobIds = [];
  WranglerFiles.find({submission_id: submission_id})
      .forEach(function (wranglerFile) {
    var newJobId = Jobs.insert({
      name: "SubmitWranglerFile",
      user_id: self.job.user_id,
      date_created: new Date(),
      args: {
        wrangler_file_id: wranglerFile._id,
      },
      prerequisite_job_id: [self.job._id],
    });
    writingJobIds.push(newJobId);
  });

  // add a job to set the submission as finished
  var allPrerequisites = writingJobIds.concat([self.job._id]);
  Jobs.insert({
    name: "FinishWranglerSubmission",
    user_id: self.job.user_id,
    date_created: new Date(),
    args: {
      submission_id: submission_id,
    },
    prerequisite_job_id: allPrerequisites,
  });
};
SubmitWranglerSubmission.prototype.onError = function (e) {
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "editing",
      errors: [
        "Error running job: " + e.toString(),
      ],
    }
  });
};


function FinishWranglerSubmission (job_id) {
  Job.call(this, job_id);

  this.submission = WranglerSubmissions.findOne(this.job.args.submission_id);
  if (!this.submission) {
    throw "Invalid submission_id";
  }
}
FinishWranglerSubmission.prototype = Object.create(Job.prototype);
FinishWranglerSubmission.prototype.constructor = FinishWranglerSubmission;
FinishWranglerSubmission.prototype.run = function () {
  var submission_id = this.submission._id;

  // make sure there are no errors defined
  var errors = this.submission.errors;
  if (errors && errors.length > 0) {
    return;
  }

  // make sure the status is writing
  if (this.submission.status !== "writing") {
    WranglerSubmissions.update({
      $set: {
        status: "editing"
      },
      $addToSet: {
        errors: "Submission status not writing when trying to set as done"
      }
    });
  }

  // make sure each WranglerFile has { written_to_database: true }
  var notWrittenCursor = WranglerFiles.find({
    submission_id: submission_id,
    written_to_database: {$ne: true},
  });
  if (notWrittenCursor.count() > 0) {
    this.retry("files not done being written");
    return;
  }

  // we did it!
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "done"
    }
  });
};
FinishWranglerSubmission.prototype.onError = function (e) {
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "editing",
      errors: [
        "Error running job: " + e.toString(),
      ],
    }
  });
};


JobClasses = {
  // usable classes (extend from Job)
  ParseWranglerFile: ParseWranglerFile,
  SubmitWranglerFile: SubmitWranglerFile,
  SubmitWranglerSubmission: SubmitWranglerSubmission,
  FinishWranglerSubmission: FinishWranglerSubmission,
};
