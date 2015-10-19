jobMethods.insertRectangularGeneExpression = {
  argumentSchema: new SimpleSchema({
    wrangler_file_id: { type: Meteor.ObjectID },
  }),
  runJob: function (args, jobDone) {
    console.log("args:", args);
    var wranglerFile = WranglerFiles.findOne(args.wrangler_file_id);
    var normalization = wranglerFile.options.normalization;
    var submission = WranglerSubmissions.findOne(wranglerFile.submission_id);

    var sampleLabels; // don't do any shifting (getting rid of first column)
    lineByLineStream(Blobs.findOne(wranglerFile.blob_id),
        function (line, lineIndex) {

      var brokenTabs = line.split("\t");
      if (lineIndex === 0) { // headerline
        sampleLabels = brokenTabs;
      } else if (lineIndex === 1) { // the line with useless info
        // nothing :)
      } else {

      }
    }, jobDone);
  },
  onError: function (args, errorDescription) {
    var wranglerFile = WranglerFiles.findOne(args.wrangler_file_id);
    WranglerSubmissions.update(wranglerFile.submission_id, {
      $set: {
        status: "editing",
        errors: ["error running job: " + errorDescription],
      }
    });
  },
};
