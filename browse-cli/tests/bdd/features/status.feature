Feature: Status command
  As a user
  I want to check the API status
  So that I can verify connectivity and config

  Scenario: Status without config
    When I run "browse status"
    Then it should exit with code 1
    And the output should mention "config"
