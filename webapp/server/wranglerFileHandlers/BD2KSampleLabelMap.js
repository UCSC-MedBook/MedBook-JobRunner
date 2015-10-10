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
  var headerLine;

  rectangularFileStream(fileObject)
    .on("line", function (brokenTabs, lineNumber, line) {
      if (lineNumber === 1) {
        headerLine = brokenTabs;
      } else {
        var sample_label = brokenTabs[headerLine.indexOf("Sample_Name")];
        var sample_uuid = brokenTabs[headerLine.indexOf("Sample_UUID")];

        emitter.emit("document-insert", {
          submission_type: "gene_expression",
          document_type: "sample_label_map",
          contents: {
            sample_label: sample_label,
            sample_uuid: sample_uuid,
          },
        });
      }
    })
    .on("error", Meteor.bindEnvironment(function (description) {
      emitter.emit("error", description);
    }))
    .on("end", Meteor.bindEnvironment(function () {
      emitter.emit("end");
    }));

  return emitter;
}


// TODO: make this one function
wranglerFileHandlers.BD2KSampleLabelMap = {
  parser: parser,
};
