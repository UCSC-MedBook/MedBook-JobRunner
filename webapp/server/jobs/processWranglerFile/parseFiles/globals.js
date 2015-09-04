wranglerProcessing = {};

// makes it easy to read a file line by line:
// calls callWithLine with each successive line of the file
lineByLineStream = function(fileObject, callWithLine, callOnEnd) {
  var byLine = Meteor.npmRequire('byline');
  var stream = byLine(fileObject.createReadStream("blobs"))
    .on('data', Meteor.bindEnvironment(function (lineObject) {
      var line = lineObject.toString();
      callWithLine(line);
    }))
    .on('end', callOnEnd);
};
