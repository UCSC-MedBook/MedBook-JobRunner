function parseSampleLabel(options) {
  for (var i in options) {
    var label = wrangleSampleLabel(options[i]);
    if (label) {
      return label;
    }
  }
  return null;
}

function parser (fileObject, options) {
  var emitter = new EventEmitter();
  var sample_label = options.sample_label;
  var gene_count = 0;

  rectangularFileStream(fileObject)
    .on("line", function (brokenTabs, lineNumber, line) {
      if (lineNumber === 1) { // header line
        if (!sample_label) {
          sample_label = parseSampleLabel([
            brokenTabs[1],
            fileObject.original.name]
          );
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
    })
    .on("error", Meteor.bindEnvironment(function (description) {
      emitter.emit("error", description);
    }))
    .on("end", Meteor.bindEnvironment(function () {
      // describe the file in a single wrangler document
      // TODO: document-upsert
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

  return emitter;
}

function write (fileObject, options) {
  return new Bluebird(Meteor.bindEnvironment(function (resolve, reject) {
    var sample_label = options.sample_label;

    rectangularFileStream(fileObject)
      .on("line", function (brokenTabs, lineNumber, line) {
        if (lineNumber === 1) { // header line
          if (!sample_label) {
            sample_label = parseSampleLabel([
              brokenTabs[1],
              fileObject.original.name]
            );
          }
        } else { // rest of file
          if (lineNumber % 1000 === 0) {console.log("lineNumber:", lineNumber);}

          var setObject = {};
          setObject["samples." + sample_label + "." +
              options.normalization] = parseFloat(brokenTabs[1]);

          expression2.upsert({
            Study_ID: options.study_label,
            gene: brokenTabs[0],
            Collaborations: [options.collaboration_label],
          }, {
            $set: setObject
          });

          if (lineNumber % 1000 === 0) {console.log("done with:", lineNumber);}
        }
      })
      .on("error", function (description) {
        // this should never happen
        console.log("ERROR: rectangularFileStream threw error during insert");
      })
      .on("end", Meteor.bindEnvironment(function () {
        resolve();
      }));
  }));
}

// TODO: make this one function
wranglerFileHandlers.BD2KGeneExpression = {
  parser: parser,
  write: write,
};
