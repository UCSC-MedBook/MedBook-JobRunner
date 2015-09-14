function wrangleSampleLabel(fileName) {
  var matches = fileName.match(/DTB-[0-9][0-9][0-9]/g);
  var guess = matches[0];
  if (matches.length > 0 &&
      _.every(matches, function (value) {
        return value === guess;
      })) {
    // TODO: what if it's ProR3 or something?
    var progressionMatches = fileName.match(/Progression/g);
    if (progressionMatches) {
      return guess + "Pro";
    } else {
      return guess;
    }
  } else {
    console.log("couldn't determine sample label from matches:", matches);
    return null;
  }
}

function isProgression(fileName) {
  return fileName.toLowerCase().indexOf("pro") > -1;
}

wranglerProcessing.parseGeneExpression = function(fileObject, normalization,
    helpers) {
  var sampleLabel = wrangleSampleLabel(fileObject.original.name);
  console.log("sampleLabel:", sampleLabel);

  var parsedFirstLine = false;
  lineByLineStream(fileObject, function (line) {
    if (parsedFirstLine) {
      var brokenTabs = line.split("\t");
      if (brokenTabs.length === 2) {
        helpers.documentInsert("gene_expression", {
          "sample_label": sampleLabel,
          "normalization": normalization,
          "gene_label": brokenTabs[0],
          "value": parseFloat(brokenTabs[1]),
        });
      } else {
        helpers.onError("Invalid line: " + line);
        jobDone();
        return;
      }
    } else {
      console.log("discarding header line:", line);
      parsedFirstLine = true;
    }
  }, function () {
    helpers.setFileStatus("done");
    jobDone();
  });
};
