// seperates the wrangler files into different jobs
jobMethods.guessWranglerFileType = {
  argumentSchema: new SimpleSchema({
    "wrangler_file_id": { type: Meteor.ObjectID },
  }),
  onRun: function (args, jobDone) {
    var wranglerFile = WranglerFiles.findOne(args.wrangler_file_id);
    if (!wranglerFile) {
      console.log("couldn't find wrangler file with _id", args.wrangler_file_id);
      jobDone();
      return "couldn't find wrangler file";
    }

    var blobObject = Blobs.findOne(wranglerFile.blob_id);
    if (!blobObject) {
      console.log("couldn't find blob with _id", wranglerFile.blob_id);
      jobDone();
      return "couldn't find blob";
    }

    if (!blobObject.hasStored("blobs")) {
      console.log("file hasn't been stored yet");
      jobDone({
        "rerun": true,
      });
      return "blob hasn't stored yet";
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

    function setFileOptions(options) {
      WranglerFiles.update(wranglerFile._id, {
        $set: {
          "options": options
        }
      });
    }

    // TODO: pull from manual_file_type if possible
    if (extensionEquals(".sif")) {
      setFileOptions({ "file_type": "superpathway_interactions" });
    } else if (extensionEquals(".tab") &&
        blobName.indexOf("definitions") > -1) {
      setFileOptions({ "file_type": "superpathway_elements" });
    } else if (extensionEquals(".vcf")) {
      setFileOptions({ "file_type": "mutation_vcf" });
    } else if (extensionEquals(".tar.gz")) {
      setFileOptions({ "file_type": "compressed_tar_gz" });
    } else if (extensionEquals(".rsem.genes.raw_counts.tab")) {
      setFileOptions({
        "file_type": "gene_expression",
        "normalization": "raw_counts",
      });
    } else if (extensionEquals(".rsem.genes.norm_counts.tab")) {
      setFileOptions({
        "file_type": "gene_expression",
        "normalization": "counts",
      });
    } else if (extensionEquals(".rsem.genes.norm_tpm.tab")) {
      setFileOptions({
        "file_type": "gene_expression",
        "normalization": "tpm",
      });
    } else if (extensionEquals(".rsem.genes.norm_fpkm.tab")) {
      setFileOptions({
        "file_type": "gene_expression",
        "normalization": "fpkm",
      });
    } else { // couldn't guess the file type anything :(
      let error_description = "Unable to guess file type. " +
          "Click here to set file type manually.";
      WranglerFiles.update(args.wrangler_file_id, {
        $set: {
          "status": "error",
          error_description,
          "options.file_type": "error",
        }
      });
    }

    jobDone();
  },
  onError: function (args, error_description) {
    error_description = "Internal error running job: " +
        firstPartOfLine(error_description);
    
    WranglerFiles.update(args.wrangler_file_id, {
      $set: {
        "status": "error",
        error_description,
      }
    });
  }
};
