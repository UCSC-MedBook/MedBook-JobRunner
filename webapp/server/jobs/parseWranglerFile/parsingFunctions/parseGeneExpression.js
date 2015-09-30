parsingFunctions.parseGeneExpression = function(fileObject, helpers,
    jobDone) {
  var noErrors = true;

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
    } else {
      noErrors = false;
      return null;
    }
  }
  var sampleLabel = wrangleSampleLabel(fileObject.original.name);

  if (!sampleLabel) {
    helpers.onError("Error: could not parse sample label from file name");
    jobDone();
    return;
  }

  lineByLineStream(fileObject, function (line, lineIndex) {
    if (noErrors) {
      if (lineIndex === 0) {
        console.log("discarding header line:", line);
      } else {
        var brokenTabs = line.split("\t");
        if (brokenTabs.length === 2) {
          helpers.documentInsert("gene_expression", "gene_expression", {
            "sample_label": sampleLabel,
            "normalization": helpers.normalization,
            "gene_label": brokenTabs[0],
            "value": parseFloat(brokenTabs[1]),
          });

          if (lineIndex % 1000 === 0) {
            console.log("lineIndex:", lineIndex);
          }
        } else {
          noErrors = false;
          helpers.onError("Invalid line: " + lineIndex +
              ' ("' + firstPartOfLine(line) + '")');
        }
      }
    }
  }, function () {
    if (noErrors) {
      helpers.setFileStatus("done");
    }
    jobDone();
  });
};
