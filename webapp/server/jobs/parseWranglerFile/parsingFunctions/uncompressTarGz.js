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

parsingFunctions.uncompressTarGz = function(compressedFile, helpers,
    jobDone) {
  // TODO: rewrite without callback-hell antipattern
  // TODO: delete these folders
  temp.mkdir('uncompressTarGz',
      Meteor.bindEnvironment(function(err, workingDir) {
    if (err) {
      helpers.onError("Internal error: " +
          "could not create working directory on server");
      jobDone();
      return;
    }

    console.log("workingDir:", workingDir);
    var compressedFileName = compressedFile.original.name;
    var compressedPath = path.join(workingDir, compressedFileName);
    var readStream = compressedFile.createReadStream('blobs');
    var writeStream = fs.createWriteStream(compressedPath);

    // write the compressed file to workingDir
    readStream.pipe(writeStream);
    writeStream.on("finish", Meteor.bindEnvironment(function () {
      helpers.setFileStatus("processing");

      // figure out what's inside
      queryFiles = spawn("tar", [
        "-tzf",
        compressedFileName
      ], { cwd: workingDir });

      // collect and read output
      var aggregatedStdout = "";
      queryFiles.stdout.on("data", function (chunk) {
        aggregatedStdout += chunk;
      });
      queryFiles.on("close", Meteor.bindEnvironment(function (exitCode) {
        if (exitCode !== 0) {
          helpers.onError("Error while querying tar file");
          jobDone();
          return;
        }

        // make a list of files from the output
        var fileList = _.filter(aggregatedStdout.split("\n"),
            function (fileName) {
          console.log("fileName:", fileName);
          // don't want the folders, hidden files, or empty strings
          return fileName.slice(-1) !== "/" &&
              fileName.slice(0, 1) !== "." &&
              !fileName.match(/\/\./) &&
              fileName.length > 0;
        });
        console.log("fileList:", fileList);

        // uncompress tar file
        console.log("spawning tar command");
        uncompress = spawn("tar", [
          "-zxvf",
          compressedFileName
        ], { cwd: workingDir });
        uncompress.on("close", Meteor.bindEnvironment(function (exitCode) {
          // process each file
          _.each(fileList, function (newFileName) {
            console.log("newFileName:", newFileName);
            // NOTE: this kind of insert only works on the server
            var blobObject = Blobs.insert(path.join(workingDir, newFileName));
            console.log("after creating blobObject");

            // set some stuff about the new file
            blobObject.name(newFileName);
            var submissionId = compressedFile.metadata.submission_id;
            Blobs.update({_id: blobObject._id}, {
              $set: {
                "metadata.uncompressed_from_id": compressedFile._id,
                "metadata.user_id": compressedFile.metadata.user_id,
                "metadata.submission_id": submissionId,
              }
            });

            // put these new files into the submission
            var wranglerFileId = WranglerFiles.insert({
              "submission_id": submissionId,
              "user_id": compressedFile.metadata.user_id,
              "blob_id": blobObject._id,
              "blob_name": newFileName,
              "status": "saving",
              "uncompressed_from_id": compressedFile._id,
            });

            var guessId = Jobs.insert({
              "name": "guessWranglerFileType",
              "user_id": compressedFile.metadata.user_id,
              "date_created": new Date(),
              "args": {
                "wrangler_file_id": wranglerFileId,
              },
            });

            Jobs.insert({
              "name": "parseWranglerFile",
              "user_id": compressedFile.metadata.user_id,
              "date_created": new Date(),
              "args": {
                "wrangler_file_id": wranglerFileId,
              },
              "prerequisite_job_id": guessId,
            });
          });

          helpers.setFileStatus("done");
          jobDone();
        }));
      }));
    }));
  }));
};
