// seperates the wrangler files into different jobs
jobMethods.guessWranglerFileType = {
  argumentSchema: new SimpleSchema({
    "wrangler_file_id": { type: Meteor.ObjectID },
  }),
  runJob: function (args) {
    console.log("runJob");

  },
  onError: function (args, error_description) {
    error_description = "Internal error running job: " +
        firstPartOfLine(error_description);

    WranglerFiles.update(args.wrangler_file_id, {
      $set: {
        "status": "error",
        error_description: error_description,
      }
    });
  }
};
