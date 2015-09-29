var spawn = Npm.require('child_process').spawn;
var temp = Meteor.npmRequire('temp'); // TODO: is my manual cleanup enough?
var path = Npm.require('path');
var fs = Npm.require('fs');

parsingFunctions.parseRectangularGeneExpression = function(fileObject, helpers,
    jobDone) {

  // create temp directory
  tmep.mkdir("parseRectangularGeneExpression",
      Meteor.bindEnvironment(function (err, workingDir) {
    if (err) {
      helpers.onError("Internal error: " +
          "could not create working directory on server");
      jobDone();
      return;
    }

    console.log("workingDir:", workingDir);
    var importFileName = path.join(workingDir, "gene_expression.tab");
    var writeStream = fs.createWriteStream(importFileName);
    var writingPromises = [];

    // write the header line
    writeStream.write("sample_label\tnormalization\tgene_label\tvalue");
    function makeWritePromise (data) {
      return new Promise(function (resolve, reject) {
        writeStream.write(data, function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    noErrors = true;
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
                var thisLine = sampleLabels[index - 1] +
                    helpers.normalization +
                    geneLabel +
                    brokenTabs[index];
                var thePromise = makeWritePromise(thisLine);
                writingPromises.push(thePromise);
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
        // call mongoimport using command line

        

        helpers.setFileStatus("done");
      }
      jobDone();
    });


  }));




  // write file that we're able to mongoimport

  // call mongoimport command line
  // mongoimport --db MedBook --collection gene_expression --file importFileName --type tsv --headerline





  // var noErrors = true;
  // var sampleLabels;

  // lineByLineStream(fileObject, function (line, lineIndex) {
  //   console.log("lineIndex:", lineIndex);
  //
  //   if (noErrors) {
  //     var brokenTabs = line.split("\t");
  //
  //     if (lineIndex === 0) {
  //       brokenTabs.shift();
  //       sampleLabels = brokenTabs;
  //     } else {
  //       if (brokenTabs.length === sampleLabels.length + 1) {
  //         var geneLabel;
  //         for (var index in brokenTabs) {
  //           if (index === "0") { // I don't know why it's a string, but it is
  //             geneLabel = brokenTabs[0];
  //           } else {
  //             helpers.documentInsert("gene_expression", {
  //               "sample_label": sampleLabels[index - 1],
  //               "normalization": helpers.normalization,
  //               "gene_label": geneLabel,
  //               "value": brokenTabs[index],
  //             });
  //           }
  //         }
  //       } else {
  //         noErrors = false;
  //         var firstPartOfLine = line.substring(0, 100);
  //         if (firstPartOfLine.length !== line.length) {
  //           firstPartOfLine += "...";
  //         }
  //         helpers.onError("Invalid line: " + lineIndex +
  //             '("'+ firstPartOfLine + '")');
  //         jobDone();
  //       }
  //     }
  //   }
  // }, function () {
  //   if (noErrors) {
  //     helpers.setFileStatus("done");
  //   }
  //   jobDone();
  // });
};
