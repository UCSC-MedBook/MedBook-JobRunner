parsingFunctions.parseTCGAGeneExpression =
    function (fileObject, helpers, jobDone) {
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
    } else if (lineIndex === 1) { // "gene_id  normalized_count  ..."
      // don't do anything ;)
    } else { // rest of file (not header lines)
      // different variable because we might want that number
      var labelAndNumber = brokenTabs[0].split("|");
      var gene_label = labelAndNumber[0];

      if (gene_label !== "?") {
        helpers.documentInsert("rectangular_gene_expression", "gene_label", {
          gene_label: gene_label,
        });
      }
    }
  });
};
