wranglerProcessing.parseSuperpathwayInteractions = function(fileObject,
    helpers, jobDone) {
  lineByLineStream(fileObject, function (line) {
    var brokenTabs = line.split("\t");
    if (brokenTabs.length === 3) {
      //console.log("adding interaction:", line);
      helpers.documentInsert("superpathway_interactions", {
        "source": brokenTabs[0],
        "target": brokenTabs[2],
        "interaction": brokenTabs[1],
        "superpathway_id": "not_created_yet",
      });
    } else {
      helpers.onError("Invalid line: " + line);
      jobDone();
      return;
    }
  }, function () {
    // TODO: make one call: one atomic update better than two
    helpers.addReviewType("superpathway");
    helpers.setFileStatus("done");
    jobDone();
  });
};

wranglerProcessing.parseSuperpathwayElements = function(fileObject,
    helpers, jobDone) {
  lineByLineStream(fileObject, function (line) {
    var brokenTabs = line.split("\t");
    if (brokenTabs.length === 2) {
      // console.log("adding definition:", line);
      helpers.documentInsert("superpathway_elements", {
        "label": brokenTabs[1],
        "type": brokenTabs[0],
        "superpathway_id": "not_created_yet",
      });
    } else {
      helpers.onError("Invalid line: " + line);
      jobDone();
      return;
    }
  }, function () {
    helpers.addReviewType("superpathway");
    helpers.setFileStatus("done");
    jobDone();
  });
};
