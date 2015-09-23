parsingFunctions.parseSuperpathwayInteractions = function(fileObject,
    helpers, jobDone) {
  var hadError = false;
  lineByLineStream(fileObject, function (line) {
    console.log("processing line:", line);
    if (!hadError) {
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
        hadError = true;
      }
      console.log("hadError end of doing line:", hadError);
    } else {
      console.log("skipping rest of file after an error");
    }
  }, function () {
    // console.log("hadError in end function:", hadError);
    if (!hadError) {
      // console.log("setting status to done");
      helpers.setFileStatus("done");
    }
    jobDone();
  });
};

parsingFunctions.parseSuperpathwayElements = function(fileObject,
    helpers, jobDone) {
  var hadError = false;
  lineByLineStream(fileObject, function (line) {
    console.log("processing line:", line);
    if (!hadError) {
      var brokenTabs = line.split("\t");
      if (brokenTabs.length === 2) {
        // console.log("adding definition:", line);
        helpers.documentInsert("superpathway_elements", {
          "label": brokenTabs[1],
          "type": brokenTabs[0],
        });
      } else {
        helpers.onError("Invalid line: " + line);
        hadError = true;
      }
      console.log("hadError end of doing line:", hadError);
    } else {
      console.log("skipping rest of file after an error");
    }
  }, function () {
    // console.log("hadError in end function:", hadError);
    if (!hadError) {
      // console.log("setting status to done");
      helpers.setFileStatus("done");
    }
    jobDone();
  });
};
