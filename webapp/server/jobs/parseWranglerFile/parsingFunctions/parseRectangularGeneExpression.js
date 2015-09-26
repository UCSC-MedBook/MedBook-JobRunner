parsingFunctions.parseRectangularGeneExpression = function(fileObject, helpers,
    jobDone) {
  var noErrors = true;
  var sampleLabels;

  lineByLineStream(fileObject, function (line, lineIndex) {
    console.log("lineIndex:", lineIndex);

    if (noErrors) {
      var brokenTabs = line.split("\t");

      if (lineIndex === 0) {
        brokenTabs.shift();
        sampleLabels = brokenTabs;
      } else {
        if (brokenTabs.length === sampleLabels.length + 1) {
          var geneLabel;
          for (var index in brokenTabs) {
            if (index === "0") { // I don't know why it's a string, but it is
              geneLabel = brokenTabs[0];
            } else {
              helpers.documentInsert("gene_expression", {
                "sample_label": sampleLabels[index - 1],
                "normalization": helpers.normalization,
                "gene_label": geneLabel,
                "value": brokenTabs[index],
              });
            }
          }
        } else {
          noErrors = false;
          var firstPartOfLine = line.substring(0, 100);
          if (firstPartOfLine.length !== line.length) {
            firstPartOfLine += "...";
          }
          helpers.onError("Invalid line: " + lineIndex +
              '("'+ firstPartOfLine + '")');
          jobDone();
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
