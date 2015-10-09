wranglerSubmissionHandlers.gene_expression = {
  validate: function (submission_id) {
    // validates when the files come in
    return [];
  },
  writeToDatabase: function (submission_id) {
    var emitter = new EventEmitter();

    var linePromises = [];

    var event = rectangularFileStream(fileObject)
      .on("line", function (brokenTabs, lineNumber, line) {


        if (lineNumber === 1) { // header line
          sample_label = wrangleSampleLabel(brokenTabs[1]);
          if (!sample_label) {
            sample_label = wrangleSampleLabel(fileObject.original.name);
          }
          if (!sample_label) {
            emitter.emit("error", "Error: could not parse sample label from " +
                "header line or file name");
          }
        } else { // rest of file
          if (lineNumber % 1000 === 0) {
            console.log("lineNumber:", lineNumber);
          }

          // actually do the insert

          if (lineNumber % 1000 === 0) {
            console.log("done with:", lineNumber);
          }
        }

        deferred.resolve();
      })
      .on("error", Meteor.bindEnvironment(function (description) {
        emitter.emit("error", description);
      }))
      .on("end", function () {
        // describe the file in a single wrangler document
        emitter.emit("document-insert", {
          submission_type: "gene_expression",
          document_type: "sample_normalization",
          contents: {
            sample_label: sample_label,
            normalization: options.normalization,
            gene_count: gene_count,
          },
        });
        emitter.emit("end");
      });


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

    return emitter;
  },
};
