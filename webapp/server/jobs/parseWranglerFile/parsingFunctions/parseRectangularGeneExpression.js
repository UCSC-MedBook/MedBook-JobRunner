parsingFunctions.parseRectangularGeneExpression =
    function (fileObject, helpers, jobDone) {
  let noErrors = true;
  let tabCount;

  lineByLineStream(fileObject, (line, lineIndex) => {
    if (lineIndex % 100 === 0) {
      console.log("lineIndex:", lineIndex);
    }

    if (noErrors) {
      let brokenTabs = line.split("\t");

      // make sure file is rectangular
      if (tabCount === undefined) {
        tabCount = brokenTabs.length;
      } else if (tabCount !== brokenTabs.length) {
        helpers.onError("File not rectangular. " +
            `Line ${lineIndex + 1} has ${brokenTabs.length} columns, not ` +
            tabCount);
        noErrors = false;
      }

      if (lineIndex === 0) { // headerline (has sample labels)
        brokenTabs.shift();
        _.each(brokenTabs, (sample_label, index) => {
          if (index % 100 === 0) {
            console.log("sample_label index:", index);
          }
          helpers.documentInsert("rectangular_gene_expression",
              "sample_label", { sample_label, });
        });
      } else { // rest of file (not header line)
        let gene_label = brokenTabs[0];
        helpers.documentInsert("rectangular_gene_expression", "gene_label", {
          gene_label,
        });
      }
    }
  }, () => {
    if (noErrors) {
      helpers.setFileStatus("done");
    }
    jobDone();
  });
};
