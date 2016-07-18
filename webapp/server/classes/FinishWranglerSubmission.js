// TODO: do this all in submit submission

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
    submission_type: { $ne: "metadata" },
    written_to_database: {$ne: true},
  });
  if (notWrittenCursor.count() > 0) {
    var errorWritingFiles = notWrittenCursor.map(function (wranglerFile) {
      var job = Jobs.findOne({
        name: "ParseWranglerFile",
        "args.wrangler_file_id": wranglerFile._id
      });

      return !job || job.status === "error";
    });

    if (errorWritingFiles.indexOf(true) !== -1) {
      throw "Internal error writing files to database";
    } else {
      this.retry("files not done being written");
      return;
    }
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

JobClasses.FinishWranglerSubmission = FinishWranglerSubmission;
