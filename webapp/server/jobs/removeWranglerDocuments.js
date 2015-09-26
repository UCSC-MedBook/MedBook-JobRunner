// clears out WranglerDocuments and reparses the file
jobMethods.removeWranglerDocuments = {
  argumentSchema: new SimpleSchema({
    "wrangler_file_id": { type: Meteor.ObjectID },
  }),
  onRun: function (args, jobDone) {
    WranglerDocuments.remove({
      "wrangler_file_id": args.wrangler_file_id,
    });
    jobDone();
  },
  onError: function (args, errorDescription) {
    WranglerFiles.update(args.wrangler_file_id, {
      $set: {
        "status": "error",
        "error_description": "Exception running job: " + errorDescription,
      }
    });
  },
};
