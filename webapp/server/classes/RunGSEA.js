// db.getCollection('jobs').insert({name: "RunGSEA", user_id: "YnyvuQDrPQu7xcCza", status: "waiting", timeout_length: 604800000, retry_count: 0, args: {gene_set_group_ids: ["mccviu2k4968wbwDk"], gene_set_id: "tGFzvWdQSfLg29SZC"}, date_created: new Date()})

function RunGSEA (job_id) {
  Job.call(this, job_id);
}
RunGSEA.prototype = Object.create(Job.prototype);
RunGSEA.prototype.constructor = RunGSEA;

RunGSEA.prototype.run = function () {
  // create paths for files on the disk
  // NOTE: GSEA will not run if the path for any of the arguments has a dash
  // in it. Use temporary folders at /tmp/RunGSEA_[job_id]
  // From the old python GSEA MedBook adapter:
  // """
  // October 14 2012
  // Amazingly long time to figure out that GSEA fails with useless
  // error message if any filename contains a dash "-"
  // eesh.
  // """
  var workDir = "/tmp/" + "RunGSEA_" + this.job._id;

  try {
    fs.mkdirSync(workDir);
  } catch (e) {
    console.log("Pretty sure you reran the job: {$set: { status: 'waiting' }}");
    console.log("error:", e);
    throw e;
  }

  console.log("workDir: ", workDir);
  var gseaOutputPath = path.join(workDir, "gseaOutput");

  // set these in a middle promise to be used at the end
  var gseaPrerankedPath;
  var prerankedOutputFileNames;
  // NOTE: this is intentionally nonspecific between the two GSEA tools
  //       as in certain cases it can be either.
  var gseaSpawnResult;

  // star the promise chain: woohoo!
  var self = this;
  var deferred = Q.defer();

  Q.all([
      // gene set group file
      spawnCommand(getSetting("gene_set_group_export"),
        self.job.args.gene_set_group_ids, workDir, {
          stdoutPath: path.join(workDir, "gene_set_groups.gmt")
        }),
      // gene set file
      spawnCommand(getSetting("gene_set_export"),
        [
          self.job.args.gene_set_id,
          self.job.args.gene_set_sort_field
        ], workDir, {
          stdoutPath: path.join(workDir, "gene_set.rnk")
        }),
    ])
    .spread(function (geneSetGroupExport, geneSetExport) {
      return spawnCommand("java", [
        "-Xmx6G", // 6 gb of RAM
        "-cp", getSetting("gsea_jar_path"),
        "xtools.gsea.GseaPreranked",
        "-gui", "false",
        "-gmx", geneSetGroupExport.stdoutPath,
        "-rnk", geneSetExport.stdoutPath,
        "-out", gseaOutputPath,
        // "-rpt_label", "yop",

        // advanced options
        "-set_max", self.job.args.set_max,
        "-set_min", self.job.args.set_min,
        "-plot_top_x", self.job.args.plot_top_x,
        "-nperm", self.job.args.nperm,

        // XXX: GSEA apparently doesn't like this argument...
        // 0    [WARN ] Some specified parameters are UNKNOWN to this usage: 1
        // metric 	>Signal2Noise<
        // at xtools.api.param.ToolParamSet.fill(?:?)
        "-metric", self.job.args.metric,
        "-scoring_scheme", self.job.args.scoring_scheme,

        // unclear what these do
        "-make_sets", "true",
        "-rnd_seed", "timestamp",

        // // defaults
        // "-mode", "Max_probe",
        // "-norm", "meandiv",

        "-collapse", "false",
      ], workDir, {
        stdoutPath: path.join(workDir, "GseaPreranked_stdout.txt"),
        stderrPath: path.join(workDir, "GseaPreranked_stderr.txt"),
      });
    })
    .then(function (result) {
      // save the result for the final bindEnvironment
      // NOTE: can't have two bindEnvironments because it returns immediately
      gseaSpawnResult = result;

      // If the job succeeded, run ls on the output directory to figure
      // out what GSEA has named the folder it put the GseaPreranked result in.
      // TODO: figure out how to name this folder? Ugh.
      // NOTE: from here on we'll protect code that requires the first GSEA
      //       to have finished correctly with this if statement.
      if (gseaSpawnResult.exitCode === 0) {
        return Q.nfcall(fs.readdir, gseaOutputPath);
      }
    })
    .then(function (gseaOutputFileNames) {
      if (gseaSpawnResult.exitCode === 0) {
        // save the name of the GseaPreranked output
        // NOTE: there is only one folder:
        //       "my_analysis.GseaPreranked.1473256347718"
        gseaPrerankedPath = path.join(gseaOutputPath, gseaOutputFileNames[0]);

        // Perform another ls command to figure out the files we need to save
        // into blobs (from the GseaPreranked command). We also use this output
        // to figure out which gene sets were found to be enriched by
        return Q.nfcall(fs.readdir, gseaPrerankedPath);
      }
    })
    .then(function (result) {
      if (gseaSpawnResult.exitCode === 0) {
        // save the prerankedOutputFileNames for later
        prerankedOutputFileNames = result;

        // Get the contents of gsea_report HTML files in order to figure out
        // which gene sets we need to include in the heatmap.

        // figure out which files we need to read
        // Ex: "gsea_report_for_na_neg_1473259869004.html"
        function getFilePath(regex) {
          var fileName = _.find(prerankedOutputFileNames, function (fileName) {
            return regex.test(fileName);
          });

          return path.join(gseaPrerankedPath, fileName);
        }
        // http://regexr.com/3e6e4
        var posFilePath = getFilePath(/_report_.*_pos_.*\.html$/);
        var negFilePath = getFilePath(/_report_.*_neg_.*\.html$/);

        // grab the contents of the files
        return Q.all([
          Q.nfcall(fs.readFile, posFilePath, "utf8"),
          Q.nfcall(fs.readFile, negFilePath, "utf8"),
        ]);
      }
    })
    .then(function (negAndPosFileContents) {
      if (gseaSpawnResult.exitCode === 0) {
        // prase the HTML files to compile a list of all the
        // gene set names to put in the heatmap
        var geneSetNames = [];

        _.each(negAndPosFileContents, function (fileContents) {
          // split the table into rows (`tr`s)
          // http://regexr.com/3e6bm
          var rows = fileContents.match(/<tr.*?<\/tr>/g);

          _.each(rows, function (rowText) {
            // Split each of the rows into columns (`td`s) and grab
            // what's in between the td tags.
            var columnsInnerText = [];

            // NOTE: capture group 1 will have the contents of the column,
            //       excluding the td tag
            // http://regexr.com/3e6ce
            // http://stackoverflow.com/a/432503/1092640
            var tdRegExp = new RegExp("<td.*?>(.*?)<\/td>", "g");
            var match = tdRegExp.exec(rowText);
            while (match !== null) {
              // matched text: match[0]
              // match start: match.index
              // capturing group n: match[n]
              columnsInnerText.push(match[1]);

              // move on to the next match
              match = tdRegExp.exec(rowText);
            }

            // "Details..." or "" in the third column indicate whether
            // or not GSEA thinks the pathway is important or not.
            // Ex: "<a href=\'HALLMARK_DNA_REPAIR.html\'>Details ...</a>"
            var detailsLink = columnsInnerText[2];

            // use the same capture-group trick as above
            // NOTE: blank strings are falsey
            if (detailsLink) {
              // http://regexr.com/3e6e7
              var match = /<a href='(.*?).html'>/g.exec(detailsLink);

              geneSetNames.push(match[1]);
            }
          });
        });

        // spawn the LeadingEdgeTool command to generate the heatmap
        return spawnCommand("java", [
          "-Xmx6G", // 6 gb of RAM
          "-cp", getSetting("gsea_jar_path"),
          "xtools.gsea.LeadingEdgeTool",
          "-dir", gseaPrerankedPath,
          "-gsets", geneSetNames.join(","),
          "-out", gseaOutputPath,
        ], workDir, {
          stdoutPath: path.join(workDir, "LeadingEdgeTool_stdout.txt"),
          stderrPath: path.join(workDir, "LeadingEdgeTool_stderr.txt"),
        });
      }
    })
    .then(function (leadingEdgeSpawnResult) {
      if (gseaSpawnResult.exitCode === 0) {
        // do different things depending on how the LeadingEdgeTool did
        if (leadingEdgeSpawnResult.exitCode === 0) {
          // Run "ls" again to figure out what GSEA named the LeadingEdgeTool
          // folder.
          return Q.nfcall(fs.readdir, gseaOutputPath);
        } else {
          // If the LeadingEdgeTool failed, set the gseaSpawnResult
          // to be the LeadingEdgeTool result so the next bit doesn't run
          // and we scoop up the log files.
          gseaSpawnResult = leadingEdgeSpawnResult;
        }
      }
    })
    .then(Meteor.bindEnvironment(function (gseaOutputFileNames) {
      if (gseaSpawnResult.exitCode === 0) {
        // use the ls result to insert all of the blobs

        var associated_object = {
          collection_name: "Jobs",
          mongo_id: self.job._id,
        };

        // Create a promise for every blob inserted. Resolve the job
        // promise when every one of those promises has been resolved.
        var blobPromises = [];
        _.each(prerankedOutputFileNames, function(fileName) {
          var def = Q.defer();
          blobPromises.push(def.promise);

          Blobs2.create(path.join(gseaPrerankedPath, fileName),
              associated_object, {}, errorResultResolver(def));
        });

        // also insert the heatmap image file
        var gseaLeadingEdgeName = _.find(gseaOutputFileNames, function (name) {
          // Ex: "my_analysis.LeadingEdgeTool.1473338595363"
          return /\.LeadingEdgeTool\./g.test(name);
        });
        var heatmapPath = path.join(gseaOutputPath, gseaLeadingEdgeName,
            "leading_edge_heat_map_clustered.png");

        var def = Q.defer();
        Blobs2.create(heatmapPath, associated_object, {},
            errorResultResolver(def));
        blobPromises.push(def.promise);

        Q.all(blobPromises)
          .then(function (values) {
            deferred.resolve({});
          })
          .catch(deferred.reject);
      } else {
        // insert the stdout and stderr files from GSEA

        // NOTE: these inserts happen asyncronously, so the job might
        // error out before the blobs have been added.
        // I can't think of a simple way for that not to be the case.
        // We could handle the error for this in the next .then, but
        // that seems like it could be confusing to someone reading along.
        var stdoutPromise = Q.defer();
        Blobs2.create(gseaSpawnResult.stdoutPath, {
          collection_name: "Jobs",
          mongo_id: self.job._id,
        }, {}, errorResultResolver(stdoutPromise));
        var stderrPromise = Q.defer();
        Blobs2.create(gseaSpawnResult.stderrPath, {
          collection_name: "Jobs",
          mongo_id: self.job._id,
        }, {}, errorResultResolver(stderrPromise));

        Q.all([ stdoutPromise, stderrPromise ]).catch(function (error) {
          console.log("Error adding error blobs for GSEA:", error);
        });

        throw "Problem running GSEA";
      }
    }, deferred.reject))
    .catch(Meteor.bindEnvironment(function (reason) {
      // always remove the created sample group even if it fails
      // SampleGroups.remove(comboSampleGroupId);

      deferred.reject(reason);
    }, deferred.reject));
  return deferred.promise;
};

JobClasses.RunGSEA = RunGSEA;
