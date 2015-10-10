// seperates the wrangler files into different jobs
jobMethods.guessWranglerFileType = {
  argumentSchema: new SimpleSchema({
    "wrangler_file_id": { type: Meteor.ObjectID },
  }),
  runJob: function (args) {
    console.log("runJob");
    var wranglerFile = WranglerFiles.findOne(args.wrangler_file_id);
    if (!wranglerFile) {
      console.log("couldn't find wrangler file with _id", args.wrangler_file_id);
      return;
    }

    var blobObject = Blobs.findOne(wranglerFile.blob_id);
    if (!blobObject) {
      console.log("couldn't find blob with _id", wranglerFile.blob_id);
      return;
    }

    if (!blobObject.hasStored("blobs")) {
      console.log("file hasn't been stored yet");
      return {
        "retry": true,
      };
    }

    // set the status to processing
    WranglerFiles.update(wranglerFile._id, {
      $set: {
        "status": "processing",
      }
    });

    // differentiate by file name, etc.
    var blobName = blobObject.original.name;
    function extensionEquals(extension) {
      return blobName.slice(-extension.length) === extension;
    }

    var options = {};
    function setFileOptions(newOptions) {
      options = newOptions;
      WranglerFiles.update(wranglerFile._id, {
        $set: {
          "options": newOptions
        }
      });
    }

    if (extensionEquals(".sif")) {
      setFileOptions({ "file_type": "SuperpathwayInteractions" });
    } else if (extensionEquals(".tab") &&
        blobName.indexOf("definitions") > -1) {
      setFileOptions({ "file_type": "SuperpathwayElements" });
    } else if (extensionEquals(".vcf")) {
      setFileOptions({ "file_type": "mutationVCF" });
    } else if (extensionEquals(".tar.gz")) {
      setFileOptions({ "file_type": "CompressedTarGz" });
    } else if (extensionEquals(".rsem.genes.raw_counts.tab")) {
      setFileOptions({
        "file_type": "BD2KGeneExpression",
        "normalization": "raw_counts",
      });
    } else if (extensionEquals(".rsem.genes.norm_counts.tab")) {
      setFileOptions({
        "file_type": "BD2KGeneExpression",
        "normalization": "counts",
      });
    } else if (extensionEquals(".rsem.genes.norm_tpm.tab")) {
      setFileOptions({
        "file_type": "BD2KGeneExpression",
        "normalization": "tpm",
      });
    } else if (extensionEquals(".rsem.genes.norm_fpkm.tab")) {
      setFileOptions({
        "file_type": "BD2KGeneExpression",
        "normalization": "fpkm",
      });
    } else { // couldn't guess the file type anything :(
      var error_description = "Unable to guess file type. " +
          "Click here to set file type manually.";
      WranglerFiles.update(args.wrangler_file_id, {
        $set: {
          "status": "error",
          error_description: error_description,
          "options.file_type": "error",
        }
      });
    }

    // see if we can attach a sample_label to BD2KGeneExpression ones
    // NOTE: assuming options hasn't changed from when it was set above
    if (options.file_type === "BD2KGeneExpression") {
      var uuidLength = "10a58066-d69b-4edf-8a88-bbbf8b91592b".length;
      var wranglerDoc = WranglerDocuments.findOne({
        submission_id: wranglerFile.submission_id,
        document_type: "sample_label_map",
        "contents.sample_uuid": blobName.slice(0, uuidLength),
      });
      if (wranglerDoc) {
        WranglerFiles.update(wranglerFile._id, {
          $set: {
            "options.sample_label": wranglerDoc.contents.sample_label
          }
        });
      }
    }
  },
  onError: function (args, error_description) {
    error_description = "Internal error running job: " +
        firstPartOfLine(error_description);

    WranglerFiles.update(args.wrangler_file_id, {
      $set: {
        "status": "error",
        error_description: error_description,
      }
    });
  }
};
