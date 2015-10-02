jobMethods.insertRectangularGeneExpression = {
  argumentSchema: new SimpleSchema({
    wrangler_file_id: { type: Meteor.ObjectID },
  }),
  onRun: function (args, jobDone) {
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
        var selector = {
          Study_ID: submission.options.study_label,
          gene: brokenTabs[0].split("|")[0],
          Collaborations: [submission.options.collaboration_label],
        };

        var existing = expression2.findOne(selector);
        var newSamples;
        if (existing) {
          newSamples = existing.samples;
        } else {
          newSamples = {};
        }

        // add the new data to newSamples
        _.each(brokenTabs, function (currentTab, index) {
          if (index !== 0) { // ignore first column
            if (newSamples[sampleLabels[index]] === undefined) {
              newSamples[sampleLabels[index]] = {};
            }
            var value = Math.log(parseInt(currentTab, 10) + 1) / Math.log(2);
            console.log("value:", value);
            newSamples[sampleLabels[index]].rsem_quan_log2 = value;
          }
        });

        console.log("newSamples:", newSamples);

        var modifier = {
          samples: newSamples,
        };

        if (existing) {
          console.log("update:", existing._id);
          var returnValue = expression2.update(existing._id, {
            $set: modifier
          });
          console.log("returnValue:", returnValue);
        } else {
          console.log("insert");
          _.extend(modifier, selector);
          expression2.insert(modifier);
        }
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
