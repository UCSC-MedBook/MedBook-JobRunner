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
  function addSubmissionError (description) {
    if (errorCount < 25) {
      WranglerSubmissions.update(submission_id, {
        $addToSet: {
          "errors": description,
        }
      });
    }

    if (errorCount === 0) { // no need to set it twice
      WranglerSubmissions.update(submission_id, {$set: {"status": "editing"}});
    }
    errorCount++;
  }

  // make sure there are some files
  if (WranglerFiles
      .find({submission_id: submission_id})
      .count() === 0) {
    return addSubmissionError("No files uploaded");
  }

  // make sure each file is "done" and don't have error_description defined
  WranglerFiles.find({submission_id: submission_id}).forEach(function (doc) {
    if (doc.status !== "done") {
      addSubmissionError("File not done: " + doc.blob_name);
    } else if (doc.error_description) {
      addSubmissionError(doc.blob_name + " has a problem: " +
          doc.error_description);
    }
  });
  if (errorCount !== 0) {
    return;
  }

  // make sure there are some documents
  // NOTE: I'm assuming we have to have documents...
  if (WranglerDocuments
      .find({submission_id: submission_id})
      .count() === 0) {
    return addSubmissionError("No documents present");
  }

  // make sure we have only one type of submission type
  var notMetadataQuery = {
    submission_id: submission_id,
    submission_type: { $ne: "metadata" },
  };
  var distinctSubmissionTypes = WranglerFiles.aggregate([
        { $match: notMetadataQuery },
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
    return addSubmissionError("Mixed submission types");
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
  WranglerFiles.find(notMetadataQuery).forEach(function (wranglerFile) {
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

JobClasses.SubmitWranglerSubmission = SubmitWranglerSubmission;
