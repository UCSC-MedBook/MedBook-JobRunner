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

parsingFunctions.parseGeneExpression = function(fileObject, helpers,
    jobDone) {
  var sampleLabel = wrangleSampleLabel(fileObject.original.name);

  lineByLineStream(fileObject, function (line, lineIndex) {
    if (lineIndex === 0) {
      console.log("discarding header line:", line);
    } else {
      var brokenTabs = line.split("\t");
      if (brokenTabs.length === 2) {
        helpers.documentInsert("gene_expression", {
          "sample_label": sampleLabel,
          "normalization": helpers.normalization,
          "gene_label": brokenTabs[0],
          "value": parseFloat(brokenTabs[1]),
        });

        if (lineIndex % 1000 === 0) {
          console.log("lineIndex:", lineIndex);
        }
      } else {
        helpers.onError("Invalid line: " + line);
        jobDone();
        return;
      }
    }
  }, function () {
    helpers.setFileStatus("done");
    jobDone();
  });
};
