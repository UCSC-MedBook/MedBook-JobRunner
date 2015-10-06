parsingFunctions.parseRectangularGeneExpression =
    function (fileObject, helpers, jobDone) {
  var noErrors = true;
  var tabCount;

  rectangularFileStream(fileObject, helpers, function (brokenTabs, lineIndex) {
    if (lineIndex === 0) { // headerline (has sample labels)
      brokenTabs.shift();
      _.each(brokenTabs, function (sample_label, index) {
        if (index % 100 === 0) {
          console.log("sample_label index:", index);
        }

        // check to see if there is a dot in the sample_label
        if (sample_label.indexOf(".") > -1) {
          noErrors = false;
          console.log("sample_label has dot:", sample_label);
          helpers.onError("Sample label has dot: " + sample_label);
        } else {
          helpers.documentInsert("rectangular_gene_expression",
              "sample_label", { sample_label: sample_label, });
        }
      });
    } else { // rest of file (not header line)
      if (lineIndex % 1000 === 0) {
        console.log("lineIndex:", lineIndex);
      }

      var gene_label = brokenTabs[0];
      helpers.documentInsert("rectangular_gene_expression", "gene_label", {
        gene_label: gene_label,
      });
    }
  });
};
