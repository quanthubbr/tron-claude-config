@echo off
if not defined EXONOUS_BIN set "EXONOUS_BIN=exonous"
"%EXONOUS_BIN%" ui-design --skill-dir "%~dp0.." %*
