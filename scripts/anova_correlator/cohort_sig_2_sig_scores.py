# cohort_sig_2_sig_scores.py
# convert a mongoexport file from cohort_signature to signature_scores
# July2015	chrisw

# imports
from optparse import OptionParser
import sys
import json
import csv
# import yaml

# global vars


# methods and functions

def getOptions():
	"parse options"
	parser = OptionParser(usage="%prog [options]")
	parser.add_option("-v", action="store_true", default=False, dest="verbose", help="Switch for verbose mode.")
	parser.add_option("-d", action="store", default='\t', type="string", dest="delimiter", help="Output delimiter, defaults to '\t'.")
	parser.add_option("-r", action="store_true", default=False, dest="reverse", help="Switch to convert tab to mongoexport.")
	
 	(options, args) = parser.parse_args()

	return (options, args)

def log(msg, die=False):
	if (verbose | die):
		sys.stderr.write(msg)
	if die:
		sys.exit(1)

#:####################################

def main():
	global verbose
	(options, args) = getOptions()
	verbose = options.verbose
	log('options:\t%s\n' % (str(options)))
	log('args:\t%s\n' % (str(args)))
	
	delimiter = options.delimiter
	
	reverse = options.reverse

	if not reverse:
		# read whole file into memory ... bad
		cohortSigStrings = sys.stdin.readlines()
#		for i in xrange(len(cohortSigStrings[0:1])):
		for i in xrange(len(cohortSigStrings)):
			cohortSigString = cohortSigStrings[i]
			cohortSigObj = json.loads(cohortSigString)
			name = cohortSigObj["description"]
			sampleValues = cohortSigObj["sample_values"]
			for j in xrange(len(sampleValues)):
				sampleValue = sampleValues[j]
				id = sampleValue["sample_label"]
				val = sampleValue["value"]
				outputObj = {"name":name, "id":id, "val":val}
				sys.stdout.write("%s\n" % (json.dumps(outputObj)))
			
	else:
		log("reverse\n")
		
# main program section
if __name__ == "__main__":
	main()
