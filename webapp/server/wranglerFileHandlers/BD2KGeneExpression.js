function parseSampleLabel(options) {
  for (var i in options) {
    var label = wrangleSampleLabel(options[i]);
    if (label) {
      return label;
    }
  }
  return null;
}

function parseSampleUUID(options, submission_id) {
  for (var i in options) {
    var label = wrangleSampleUUID(options[i], submission_id);
    if (label) {
      return label;
    }
  }
  return null;
}

function getSampleLabel (brokenTabs, fileObject) {
  var sample_label;

  var possibleStrings = [
    brokenTabs[1],
    fileObject.original.name
  ];

  // try to wrangle sample label
  sample_label = parseSampleLabel(possibleStrings);

  // try to wrangle sample uuid
  if (!sample_label) {
    sample_label = parseSampleUUID(possibleStrings, fileObject.metadata.submission_id);
  }

  console.log("sample_label:", sample_label);
  return sample_label;
}

// TODO: make a promise
function parser (fileObject, options) {
  var emitter = new EventEmitter();
  var sample_label;
  var gene_count = 0;

  rectangularFileStream(fileObject)
    .on("line", function (brokenTabs, lineNumber, line) {
      if (lineNumber === 1) { // header line
        sample_label = getSampleLabel(brokenTabs, fileObject);

        if (!sample_label) {
          emitter.emit("error", "Error: could not parse sample label from " +
              "header line or file name");
        }
      } else { // rest of file
        gene_count++;
        if (lineNumber % 1000 === 0) {
          console.log("lineNumber:", lineNumber);
        }

        // // validate gene_label against gene_label database
        // var gene_label = brokenTabs[0];
        // var genes = Genes.find({
          // $or: [
          //   {gene: gene_label},
          //   {"synonym": {$elemMatch: {$in: [gene_label]}}},
          //   {"previous": {$elemMatch: {$in: [gene_label]}}}
          // ]
        // }).fetch();
        // if (genes.length === 0) {
        //   console.log("Unknown gene: " + gene_label);
        //   // emitter.emit("error", message);
        // } else if (genes.length > 1) {
        //   console.log("Multiple gene matches found for " + gene_label);
        //   // emitter.emit("error", message);
        // } else {
        //   var gene = genes[0];
        //   if (gene_label !== gene.gene) {
        //     // not the end of the world, we can map it
        //     emitter.emit("document-insert", {
        //       submission_type: "gene_expression",
        //       document_type: "gene_label_map",
        //       contents: {
        //         old_label: gene_label,
        //         new_label: gene.gene,
        //       },
        //     });
        //   }
        // }

        // make sure it's a number
        var supposedValue = brokenTabs[1];
        if (isNaN(supposedValue)) {
          emitter.emit("error", "Not a valid value for " + gene_label +
              " on line " + lineNumber + ": " + supposedValue);
        }

        if (lineNumber % 1000 === 0) { console.log("done with:", lineNumber);}
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
    var sample_label;
    var sampleLabelPromise;

    rectangularFileStream(fileObject)
      .on("line", function (brokenTabs, lineNumber, line) {
        if (lineNumber === 1) { // header line
          console.log("first line!");
          var deferred = Bluebird.defer();
          sampleLabelPromise = deferred.promise;
          sample_label = getSampleLabel(brokenTabs, fileObject);
          console.log("about to resolve!");
          deferred.resolve();
        } else { // rest of file
          sampleLabelPromise.then(Meteor.bindEnvironment(function () {
            if (lineNumber % 1000 === 0) {console.log("lineNumber:", lineNumber);}
            var setObject = {};
            setObject["samples." + sample_label + "." +
                options.normalization] = parseFloat(brokenTabs[1]);

            console.log("setObject:", setObject);
            expression2.upsert({
              Study_ID: options.study_label,
              gene: brokenTabs[0],
              Collaborations: [options.collaboration_label],
            }, {
              $set: setObject
            });

            if (lineNumber % 100 === 0) {console.log("done with:", lineNumber);}
          }));
        }
      })
      .on("error", function (description) {
        // this should never happen
        console.log("ERROR: rectangularFileStream threw error during insert");
      })
      .on("end", Meteor.bindEnvironment(function () {
        console.log("about to resolve");
        resolve();
      }));
  }));
}

// TODO: make this one function
wranglerFileHandlers.BD2KGeneExpression = {
  parser: parser,
  write: write,
};
