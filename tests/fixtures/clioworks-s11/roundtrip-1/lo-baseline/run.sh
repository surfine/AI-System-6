#!/bin/sh
# LibreOffice baseline for round trip ① (headless, no GUI): recalculate on load,
# export the computed values, and save back to xlsx for the ledger-adapter read-back.
# Usage: sh run.sh  (from this directory; needs soffice on PATH)
set -e
P="$(mktemp -d)"; mkdir -p "$P/user"; cp recalc-on-load.xcu "$P/user/registrymodifications.xcu"
CSV='csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,true,false,false,-1'
soffice -env:UserInstallation="file://$P" --headless --convert-to "$CSV" --outdir out ../edited.xlsx
soffice -env:UserInstallation="file://$P" --headless --convert-to 'xlsx:Calc MS Excel 2007 XML' --outdir out ../edited.xlsx
# Control: D2's cached value tampered to 999 must come back as 1,500 (proves recalculation, not the cache).
soffice -env:UserInstallation="file://$P" --headless --convert-to "$CSV" --outdir out tampered-d2-999.xlsx
