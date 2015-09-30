jobMethods.insertRectangularGeneExpression = {
  argumentSchema: new SimpleSchema({
    wrangler_file_id: { type: Meteor.ObjectID },
  }),
  onRun: function (args, jobDone) {
    console.log("args:", args);
    console.log("we haven't done this yet");
    jobDone();
  },
  onError: function (args, errorDescription) {
    var wranglerFile = WranglerFile.findOne(args.wrangler_file_id);
    WranglerSubmissions.update(wranglerFile.submission_id, {
      $set: {
        status: "waiting",
        errors: ["error running job: " + errorDescription],
      }
    });
  },
};
