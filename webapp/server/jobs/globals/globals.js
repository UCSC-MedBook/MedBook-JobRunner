// the keys here correspond to Jobs.name in the Jobs collection
jobMethods = {};

// makes it easy to read a file line by line:
// calls callWithLine with each successive line of the file
lineByLineStream = function(fileObject, callWithLine, callOnEnd) {
  var lineIndex = 0;

  var byLine = Meteor.npmRequire('byline');
  var stream = byLine(fileObject.createReadStream("blobs"))
    .on('data', Meteor.bindEnvironment(function (lineObject) {
      var line = lineObject.toString();
      callWithLine(line, lineIndex);
      lineIndex++;
    }));
  if (callOnEnd) {
    stream.on('end', callOnEnd);
  }
  return stream;
};

// specifically for parsing tab-seperated files
rectangularFileStream = function (fileObject, helpers, callWithBrokenTabs) {
  var noErrors = true;
  var tabCount;

  var oldOnError = helpers.onError;
  helpers.onError = function () {
    noErrors = false;
    oldOnError();
  };

  lineByLineStream(fileObject, function (line, lineIndex) {
    if (noErrors) {
      var brokenTabs = line.split("\t");

      // make sure file is rectangular
      if (tabCount === undefined) {
        tabCount = brokenTabs.length;
      } else if (tabCount !== brokenTabs.length) {
        noErrors = false;
        helpers.onError("File not rectangular. " +
            "Line " + (lineIndex + 1) + " has " + brokenTabs.length +
            " columns, not " + tabCount);
      }

      callWithBrokenTabs(brokenTabs, lineIndex, line);
    }
  }, function () {
    if (noErrors) {
      helpers.setFileStatus("done");
    }
    jobDone(); // TODO: figure out a better place for this
  });
};

// gets the first part of a string, adds "..." at the end if greater than 50
// characters long
firstPartOfLine = function (line) {
  let maxLength = 50;
  let firstPart = line.substring(0, maxLength);
  if (firstPart !== line) {
    firstPart = firstPart.substring(0, maxLength - 3) + "...";
  }
  return firstPart;
};
