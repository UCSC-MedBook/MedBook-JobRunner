var spawn = Npm.require('child_process').spawn;
var temp = Meteor.npmRequire('temp'); // TODO: is my manual cleanup enough?
var path = Npm.require('path');
var fs = Npm.require('fs');

function removeForce(path) {
  rm = spawn("rm", ["-rf", path]);

  rm.stdout.on("data", function (data) {
    console.log("stdout:", data);
  });
  rm.stderr.on("data", function (data) {
    console.log("stderr:", data);
  });
  rm.on("close", function (exitCode) {
    console.log("exited rm with code", exitCode);
  });
}

wranglerProcessing.uncompressTarGz = function(compressedFile, helpers,
    jobDone) {
  // TODO: helper.onError with console log messages

  // TODO: delete these folders
  temp.mkdir('uncompressTarGz',
      Meteor.bindEnvironment(function(err, workingDir) {
    if (err) {
      console.elog("error creating working directory (uncompressTarGz):", err);
      return;
    }

    console.log("workingDir:", workingDir);

    var compressedFileName = compressedFile.original.name;
    var compressedPath = path.join(workingDir, compressedFileName);
    var readStream = compressedFile.createReadStream('blobs');
    var writeStream = fs.createWriteStream(compressedPath);

    // write the compressed file to workingDir
    readStream.on("data", function (chunk) {
      writeStream.write(chunk);
    });
    readStream.on("end", Meteor.bindEnvironment(function () {
      helpers.setFileStatus("processing");
      removeForce(compressedPath);

      // note: don't care about stdout (files listed on stderr)
      var errorArray = [];

      // spawn a process to decompress the tar file
      tar = spawn("tar", ["-zxvf", compressedFileName], { cwd: workingDir });
      tar.stderr.on("data", function (data) {
        // write all of that file to the errorArray
        errorArray.push(data.toString());
      });
      tar.on("close", Meteor.bindEnvironment(function (exitCode) {
        if (exitCode !== 0) {
          console.log("error running tar job:", compressedFileName);
        } else {
          // filter so we don't get empty lines or folders (end with '/')
          // then map over them to remove the "x " before each line
          var fileNames = _.map(_.filter(errorArray.join("").split("\n"),
                  function (consoleLine) {
                return consoleLine.length > 0 &&
                    consoleLine.slice(-1) !== "/";
              }), function (consoleLine) {
                return consoleLine.substring(2);
              });

          // process each file
          _.each(fileNames, function (newFileName) {
            Blobs.insert(path.join(workingDir, newFileName),
                function (error, fileObject) {
              // NOTE: assumption made that this callback runs before the
              // .on("stored") function for the file

              if (error) {
                console.log("error adding blob from uncompressed:", error);
              } else {
                // set some stuff about the new file
                fileObject.name(newFileName);
                var submissionId = compressedFile.metadata.submission_id;
                Blobs.update({_id: fileObject._id}, {
                  $set: {
                    "metadata.uncompressed_from_id": compressedFile._id,
                    "metadata.user_id": compressedFile.metadata.user_id,
                    "metadata.submission_id": submissionId,
                  }
                });

                WranglerFiles.insert({
                  "submission_id": submissionId,
                  "user_id": compressedFile.metadata.user_id,
                  "file_id": fileObject._id,
                  "file_name": newFileName,
                  "status": "saving",
                  "uncompressed_from_id": compressedFile._id,
                });
              }
            });
          });

          helpers.setFileStatus("done");
          jobDone();

          // TODO: remove the compressed file from the submission?
        }
      }));
    }));
  }));
};
