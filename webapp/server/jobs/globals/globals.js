// the keys here correspond to Jobs.name in the Jobs collection
jobMethods = {};

rectangularFileStream = function (fileObject) {
  var emitter = new EventEmitter();

  var linePromises = [];

  var lineNumber = 0; // starts at one
  var tabCount;

  var byLine = Meteor.npmRequire('byline');
  byLine(fileObject.createReadStream("blobs"))
    .on('data', Meteor.bindEnvironment(function (lineObject) {
      var deferred = Bluebird.defer();
      linePromises.push(deferred.promise);

      var line = lineObject.toString();
      var brokenTabs = line.split("\t");
      lineNumber++;

      // make sure file is rectangular
      if (tabCount === undefined) {
        tabCount = brokenTabs.length;
      } else if (tabCount !== brokenTabs.length) {
        emitter.emit("error", "File not rectangular. " +
            "Line " + lineNumber + " has " + brokenTabs.length +
            " columns, not " + tabCount);
      }

      emitter.emit("line", brokenTabs, lineNumber, line);

      deferred.resolve();
    }))
    .on('end', Meteor.bindEnvironment(function () {
      Bluebird.all(linePromises)
        .then(Meteor.bindEnvironment(function () {
          emitter.emit("end");
        }));
    }));

  return emitter;
};

// gets the first part of a string, adds "..." at the end if greater than 50
// characters long
firstPartOfLine = function (line) {
  var maxLength = 50;
  var firstPart = line.substring(0, maxLength);
  if (firstPart !== line) {
    firstPart = firstPart.substring(0, maxLength - 3) + "...";
  }
  return firstPart;
};

wrangleSampleLabel = function (text) {
  var matches = text.match(/DTB-[0-9][0-9][0-9]/g);
  if (matches && matches.length > 0 &&
      _.every(matches, function (value) {
        return value === matches[0];
      })) {
    // TODO: what if it's ProR3 or something?
    var progressionMatches = text.match(/pro/gi);
    if (progressionMatches) {
      return matches[0] + "Pro";
    } else {
      return matches[0];
    }
  }
};
