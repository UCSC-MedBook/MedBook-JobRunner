function wrangleSampleLabel(fileName) {
  var matches = fileName.match(/DTB-[0-9][0-9][0-9]/g);
  if (matches && matches.length > 0 &&
      _.every(matches, function (value) {
        return value === matches[0];
      })) {
    // TODO: what if it's ProR3 or something?
    var progressionMatches = fileName.match(/Progression/g);
    if (progressionMatches) {
      return matches[0] + "Pro";
    } else {
      return matches[0];
    }
  }
}

function parser (fileObject, options) {
  var emitter = new EventEmitter();
  var sample_label;
  var gene_count = 0;

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
        gene_count++;
        if (lineNumber % 1000 === 0) {
          console.log("lineNumber:", lineNumber);
        }

        // validate gene_label against gene_label database
        var supposedGeneLabel = brokenTabs[0];
        // db.getCollection('genes').find({$or: [{gene: "AACSL"}, {"synonym": {$elemMatch: {$in: ["AACSL"]}}}, {"previous": {$elemMatch: {$in: ["AACSL"]}}}]})
        if (expression2.find({gene: supposedGeneLabel}).count() === 0) {
          emitter.emit("error", "Unknown gene: " + supposedGeneLabel);
        }

        // make sure it's a number
        var supposedValue = brokenTabs[1];
        if (isNaN(supposedValue)) {
          emitter.emit("error", "Not a valid value for " + supposedGeneLabel +
              " on line " + lineNumber + ": " + supposedValue);
        }

        if (lineNumber % 1000 === 0) {
          console.log("done with:", lineNumber);
        }
      }

      deferred.resolve();
    })
    .on("error", Meteor.bindEnvironment(function (description) {
      emitter.emit("error", description);
    }))
    .on("end", Meteor.bindEnvironment(function () {
      Bluebird.all(linePromises)
        .then(Meteor.bindEnvironment(function () {
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
        }));
    }));

  return emitter;
}

wranglerFileHandlers.BD2KGeneExpression = {
  parser: parser,
  insert: function () {
    console.log("this hasn't been defined yet");
  },
};
