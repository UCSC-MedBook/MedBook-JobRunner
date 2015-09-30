jobMethods.setSubmissionAsFinished = {
  argumentSchema: new SimpleSchema({
    submission_id: { type: Meteor.ObjectID },
  }),
  onRun: function (args, jobDone) {
    WranglerSubmissions.update(args.submission_id, {
      $set: {
        "status": "done"
      }
    });
    jobDone();
  },
  onError: function (args, errorDescription) {
    WranglerSubmissions.update(args.submission_id, {
      $set: {
        status: "waiting",
        errors: ["error running job: " + errorDescription],
      }
    });
  },
};
