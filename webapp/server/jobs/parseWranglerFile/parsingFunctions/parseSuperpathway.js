parsingFunctions.parseSuperpathwayInteractions = function(fileObject,
    helpers, jobDone) {

  lineByLineStream(fileObject, function (line) {
    var brokenTabs = line.split("\t");
    if (brokenTabs.length === 3) {
      //console.log("adding interaction:", line);
      helpers.documentInsert("superpathway_interactions", {
        "source": brokenTabs[0],
        "target": brokenTabs[2],
        "interaction": brokenTabs[1],
      });
    } else {
      helpers.onError("Invalid line: " + line);
      jobDone();
      return;
    }
  }, function () {
    helpers.setFileStatus("done");
    jobDone();
  });
};

parsingFunctions.parseSuperpathwayElements = function(fileObject,
    helpers, jobDone) {

  lineByLineStream(fileObject, function (line) {
    var brokenTabs = line.split("\t");
    if (brokenTabs.length === 2) {
      // console.log("adding definition:", line);
      helpers.documentInsert("superpathway_elements", {
        "label": brokenTabs[1],
        "type": brokenTabs[0],
      });
    } else {
      helpers.onError("Invalid line: " + line);
      jobDone();
      return;
    }
  }, function () {
    helpers.setFileStatus("done");
    jobDone();
  });
};
