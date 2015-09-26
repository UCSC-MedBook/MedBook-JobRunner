

parsingFunctions.parseSuperpathwayInteractions = function(fileObject,
    helpers, jobDone) {
  var hadError = false;
  lineByLineStream(fileObject, function (line, lineIndex) {
    if (!hadError) {
      var brokenTabs = line.split("\t");
      if (brokenTabs.length === 3) {
        helpers.documentInsert("superpathway_interactions", {
          "source": brokenTabs[0],
          "target": brokenTabs[2],
          "interaction": brokenTabs[1],
        });
      } else {
        hadError = true;
        helpers.onError("Invalid line " + lineIndex +
            ': ("' + firstPartOfLine(line) + '")');
      }
    }
  }, function () {
    if (!hadError) {
      helpers.setFileStatus("done");
    }
    jobDone();
  });
};

parsingFunctions.parseSuperpathwayElements = function(fileObject,
    helpers, jobDone) {
  var hadError = false;
  lineByLineStream(fileObject, function (line, lineIndex) {
    if (!hadError) {
      var brokenTabs = line.split("\t");
      if (brokenTabs.length === 2) {
        helpers.documentInsert("superpathway_elements", {
          "label": brokenTabs[1],
          "type": brokenTabs[0],
        });
      } else {
        hadError = true;
        helpers.onError("Invalid line " + lineIndex +
            ': ("' + firstPartOfLine(line) + '")');
      }
    }
  }, function () {
    if (!hadError) {
      helpers.setFileStatus("done");
    }
    jobDone();
  });
};
