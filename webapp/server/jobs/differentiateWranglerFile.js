// seperates the wrangler files into different jobs
jobMethods.differentiateWranglerFile = function (args, jobDone) {
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
    jobDone(true);
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

  var parsingArgs = {
    "wrangler_file_id": wranglerFile._id,
  };

  // TODO: pull from manual_file_type if possible
  if (extensionEquals(".sif")) {
    parsingArgs.parsing_name = "parseSuperpathwayInteractions";
  } else if (extensionEquals(".tab") &&
      blobName.indexOf("definitions") > -1) {
    parsingArgs.parsing_name = "parseSuperpathwayElements";
  } else if (extensionEquals(".vcf")) {
    parsingArgs.parsing_name = "parseMutationVCF";
  } else if (extensionEquals(".tar.gz")) {
    parsingArgs.parsing_name = "uncompressTarGz";
  } else if (extensionEquals(".rsem.genes.raw_counts.tab")) {
    parsingArgs.normalization = "raw_counts";
    parsingArgs.parsing_name = "parseGeneExpression";
  } else if (extensionEquals(".rsem.genes.norm_counts.tab")) {
    parsingArgs.normalization = "counts";
    parsingArgs.parsing_name = "parseGeneExpression";
  } else if (extensionEquals(".rsem.genes.norm_tpm.tab")) {
    parsingArgs.normalization = "tpm";
    parsingArgs.parsing_name = "parseGeneExpression";
  } else if (extensionEquals(".rsem.genes.norm_fpkm.tab")) {
    parsingArgs.normalization = "fpkm";
    parsingArgs.parsing_name = "parseGeneExpression";
  }

  if (parsingArgs.parsing_name) {
    // make a job to actually do the parsing
    Jobs.insert({
      "name": "parseWranglerFile",
      "date_created": new Date(),
      "args": parsingArgs,
    });
  } else {
    // we weren't able to guess the file type :(
    WranglerFiles.update(wranglerFile._id, {
      $set: {
        "status": "error",
        "error_description": "unable to guess file type",
      }
    });
  }

  jobDone();
};
